import {
  BadRequestException,
  ServiceUnavailableException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import {
  LearnerAttemptAnswerResponseDto,
  LearnerAttemptResponseDto,
  type AttemptSource,
  type SaveAttemptAnswerDto,
  type SaveDraftAnswerDto,
  type SavedAnswerRow,
  type SubmitAnswerDto,
  type SubmitQuizDto,
} from '../dto/quiz-attempt.dto.js';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';
import { QuizQuestionEntity } from '../entities/quiz-question.entity.js';
import {
  buildQuizSnapshot,
  type ShuffleFn,
  secureShuffle,
} from './quiz-attempt-snapshot.js';
import {
  QuizCourseResolverService,
  QuizTargetNotFoundError,
} from './quiz-course-resolver.service.js';
import { CourseProgressCalculatorService } from '../../progress/services/course-progress-calculator.service.js';
import { gradeAttempt } from './quiz-grading.js';
import {
  calculateScore,
  toBreakdownDto,
} from './quiz-score-calculator.service.js';
import {
  cloudinaryConfig,
  isCloudinaryUrl,
  signCloudinaryParams,
} from './cloudinary-upload.js';
import { assertTransition, isScoreConcealed } from './quiz-attempt-state.js';
import { QuizLearnerAccessService } from './quiz-learner-access.service.js';
import {
  buildAttemptResult,
  SHOW_ADJUSTMENT_REASON_TO_LEARNER,
} from '../dto/quiz-attempt-result.dto.js';
import { isReviewAllowed } from './quiz-review-policy.js';
import {
  EssayGradingStatus,
  EssaySubmissionType,
  type EssayAnswer,
} from '../domain/assessment.types.js';

type LockedAttempt = AttemptSource & {
  userId: string;
  expired: boolean;
  pastGrace: boolean;
  // updated_at as exact text: identifies one SUBMITTING claim.
  submissionToken: string;
  // A SUBMITTING claim older than SUBMISSION_LEASE_SECONDS.
  leaseExpired: boolean;
};
// Rejections are returned, not thrown, so the transaction commits first.
type Rejected = { rejected: string };
type Started = { created: boolean; attempt: LearnerAttemptResponseDto };

/**
 * Network latency tolerance for POST /submit only: a submission arriving up
 * to this long after expires_at still counts as SUBMITTED. Every other
 * touchpoint enforces the deadline exactly.
 */
export const GRACE_PERIOD_SECONDS = 5;

/**
 * How long a SUBMITTING claim is honoured. Grading takes milliseconds; a
 * claim this old means its request died between claiming and grading, and
 * the next submit (or start, resume, result) finishes the job instead.
 */
export const SUBMISSION_LEASE_SECONDS = 30;

// Server-authoritative timer: deadlines are decided only by the database
// clock, never by anything the client sends. clock_timestamp() (not now())
// so time spent waiting for a lock counts.
const ATTEMPT_COLUMNS = `id, user_id AS "userId", quiz_id AS "quizId",
  attempt_number AS "attemptNumber", quiz_snapshot AS "quizSnapshot", status,
  started_at AS "startedAt", expires_at AS "expiresAt",
  submitted_at AS "submittedAt", score, is_passed AS "isPassed",
  earned_points AS "earnedPoints", total_points AS "totalPoints",
  percentage::float8 AS percentage,
  (expires_at IS NOT NULL AND clock_timestamp() > expires_at) AS expired,
  updated_at::text AS "submissionToken",
  (clock_timestamp() > updated_at
    + make_interval(secs => ${SUBMISSION_LEASE_SECONDS})) AS "leaseExpired",
  (expires_at IS NOT NULL AND clock_timestamp()
    > expires_at + make_interval(secs => ${GRACE_PERIOD_SECONDS}))
    AS "pastGrace",
  clock_timestamp() AS "serverNow"`;

const error = (code: string) => ({ message: code, code });
const ATTEMPT_NOT_FOUND = { statusCode: 404, ...error('ATTEMPT_NOT_FOUND') };

@Injectable()
export class QuizAttemptsService {
  // Overridable so tests can pin the order; production always shuffles securely.
  shuffle: ShuffleFn = secureShuffle;

  // Attempts closed inside a transaction, keyed by its manager, so progress
  // caches are invalidated only once the grade has committed.
  private readonly closedIn = new WeakMap<
    EntityManager,
    Array<{ userId: string; courseId: string }>
  >();

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: QuizLearnerAccessService,
    private readonly resolver: QuizCourseResolverService,
    private readonly progress: CourseProgressCalculatorService,
  ) {}

  private async transaction<T>(work: (manager: EntityManager) => Promise<T>) {
    const closed: Array<{ userId: string; courseId: string }> = [];
    const result = await this.dataSource.transaction((manager) => {
      this.closedIn.set(manager, closed);
      return work(manager);
    });
    // A pass can complete a course (or move its progress bar).
    for (const { userId, courseId } of closed)
      await this.progress.invalidateStudentProgress(userId, courseId);
    return result;
  }

  /**
   * The unified start engine, identical for all four scopes:
   *
   * 1. published status          -> 403 QUIZ_FORBIDDEN
   * 2. scope access resolution   -> 403 TARGET_COURSE_FORBIDDEN
   * 3. running, unexpired attempt -> resumed as is (200), nothing created
   * 4. maxAttempts               -> 409 MAX_ATTEMPTS_REACHED
   * 5. freeze snapshot, create IN_PROGRESS with expires_at (201)
   *
   * Steps 1 and 3-5 run in one transaction under pessimistic locks: an
   * advisory lock per learner and quiz (it also covers the zero-attempt
   * case, where there is no row to lock yet), the learner's attempt rows
   * FOR UPDATE while counting them, and the quiz row FOR SHARE so publish,
   * new versions and question edits wait until the snapshot is taken. Two
   * tabs pressing Start therefore queue: the second resumes the first's
   * attempt and can never exceed the limit.
   */
  async start(principal: Principal, quizId: string) {
    // 1-2 up front, so access denials need no lock.
    await this.access.assertCanTake(
      principal,
      await this.access.loadPublishedQuiz(quizId),
    );

    const result = await this.transaction(
      async (manager): Promise<Started | Rejected> => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`quiz-attempt:${principal.id}:${quizId}`],
        );
        // 1, again under lock: it may have been unpublished meanwhile.
        const quiz = await this.access.loadPublishedQuiz(quizId, manager, true);

        // 3. Resume. Timeout consumes the attempt; it counts towards 4. A
        // submission being graded must finish before anything new starts.
        const active = await this.lockActive(manager, principal.id, quizId);
        if (
          active?.status === QuizAttemptStatus.SUBMITTING &&
          !(await this.settleStaleSubmission(manager, active))
        )
          return { rejected: 'SUBMISSION_IN_PROGRESS' };
        if (
          active?.status === QuizAttemptStatus.IN_PROGRESS &&
          !(await this.checkAndEnforceTimeout(manager, active))
        )
          return { created: false, attempt: await this.view(manager, active) };

        // 4. Every attempt of every version counts.
        const used = (
          await manager.query<Array<{ id: string }>>(
            `SELECT id FROM quiz_attempts
             WHERE user_id = $1 AND quiz_id = $2 FOR UPDATE`,
            [principal.id, quizId],
          )
        ).length;
        if (quiz.maxAttempts !== null && used >= quiz.maxAttempts)
          return { rejected: 'MAX_ATTEMPTS_REACHED' };

        // 5. Freeze and create.
        const questions = await manager.getRepository(QuizQuestionEntity).find({
          where: { quizId },
          relations: { options: true },
        });
        if (!questions.length) return { rejected: 'QUIZ_HAS_NO_QUESTIONS' };
        const snapshot = buildQuizSnapshot(
          quiz,
          await this.courseIdOf(quiz),
          questions,
          this.shuffle,
        );

        const [created] = await manager.query<LockedAttempt[]>(
          `WITH clock AS (SELECT clock_timestamp() AS at)
         INSERT INTO quiz_attempts(user_id, quiz_id, quiz_version,
           attempt_number, quiz_snapshot, started_at, expires_at)
         SELECT $1, $2, $3, $4, $5::jsonb, clock.at,
           clock.at + make_interval(mins => $6::int)
         FROM clock
         RETURNING ${ATTEMPT_COLUMNS}`,
          [
            principal.id,
            quizId,
            quiz.version,
            used + 1,
            JSON.stringify(snapshot),
            quiz.durationMinutes,
          ],
        );
        return { created: true, attempt: await this.view(manager, created!) };
      },
    );

    if ('rejected' in result)
      throw new ConflictException({
        statusCode: 409,
        ...error(result.rejected),
      });
    return result;
  }

  /**
   * Restores a running attempt after reload or on another device: the
   * snapshot without its answer key, plus every saved answer. An attempt
   * found past its deadline is auto-submitted as TIMED_OUT and its result
   * returned instead.
   */
  async activeAttempt(principal: Principal, quizId: string) {
    await this.access.assertCanTake(
      principal,
      await this.access.loadQuiz(quizId),
    );
    const attempt = await this.transaction(async (manager) => {
      const active = await this.lockActive(manager, principal.id, quizId);
      if (!active) return null;
      return (
        (await this.settleStaleSubmission(manager, active)) ??
        (await this.checkAndEnforceTimeout(manager, active)) ??
        this.view(manager, active)
      );
    });
    if (!attempt)
      throw new NotFoundException({
        statusCode: 404,
        ...error('NO_ACTIVE_ATTEMPT'),
      });
    return attempt;
  }

  /**
   * Autosave: UPSERTs this question's selection, last write wins, stamped
   * with the database clock. Past the deadline the attempt is auto-submitted
   * and the answer refused with 400 ATTEMPT_EXPIRED; `notice:
   * ATTEMPT_TIMED_OUT` and the closed `attempt` tell the client it was
   * auto-submitted.
   */
  async saveAnswer(
    principal: Principal,
    attemptId: string,
    answer: SaveAttemptAnswerDto,
  ) {
    return this.persistAnswer(principal, attemptId, answer, false);
  }

  /**
   * Draft autosave for any question type (PATCH .../answers/draft): the same
   * UPSERT on (attempt, question) as saveAnswer, but an essay may be empty or
   * unfinished. Never grades and never changes the attempt's status.
   */
  async saveDraft(
    principal: Principal,
    attemptId: string,
    draft: SaveDraftAnswerDto,
  ) {
    return this.persistAnswer(principal, attemptId, draft, true);
  }

  /**
   * The attempt with every saved answer (`selectedOptionIds`, `essayAnswer`)
   * so a reload or another device restores the exact state. Applies the same
   * lazy timeout settlement as the other touchpoints.
   */
  async getAttempt(principal: Principal, attemptId: string) {
    await this.assertOwnAttempt(principal, attemptId);
    return this.transaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);
      return (
        (await this.settleStaleSubmission(manager, attempt)) ??
        (await this.checkAndEnforceTimeout(manager, attempt)) ??
        this.view(manager, attempt)
      );
    });
  }

  /**
   * Signed parameters for a direct browser -> Cloudinary upload into this
   * attempt's folder. The file never passes through the API, and the secret
   * never leaves it.
   */
  async attachmentUploadSignature(principal: Principal, attemptId: string) {
    await this.assertOwnAttempt(principal, attemptId);
    const config = cloudinaryConfig();
    if (!config)
      throw new ServiceUnavailableException({
        statusCode: 503,
        ...error('UPLOADS_NOT_CONFIGURED'),
      });
    const [attempt] = await this.dataSource.query<Array<{ status: string }>>(
      'SELECT status FROM quiz_attempts WHERE id = $1',
      [attemptId],
    );
    if (attempt?.status !== QuizAttemptStatus.IN_PROGRESS)
      throw new ConflictException({
        statusCode: 409,
        ...error('ATTEMPT_NOT_IN_PROGRESS'),
      });
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `shanity/quiz-attempts/${attemptId}`;
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`,
      apiKey: config.apiKey,
      timestamp,
      folder,
      signature: signCloudinaryParams({ folder, timestamp }, config.apiSecret),
    };
  }

  private async persistAnswer(
    principal: Principal,
    attemptId: string,
    answer: AnswerInput,
    draft: boolean,
  ) {
    await this.assertOwnAttempt(principal, attemptId);
    const result = await this.transaction(
      async (
        manager,
      ): Promise<
        | { saved: SavedAnswerRow }
        | Rejected
        | { timedOut: LearnerAttemptResponseDto }
      > => {
        const attempt = await this.lockAttempt(manager, attemptId);
        if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
          return { rejected: 'ATTEMPT_NOT_IN_PROGRESS' };
        const timedOut = await this.checkAndEnforceTimeout(manager, attempt);
        if (timedOut) return { timedOut };
        return { saved: await upsertAnswer(manager, attempt, answer, draft) };
      },
    );
    // Thrown after commit so a detected timeout stays recorded.
    if ('timedOut' in result)
      throw new BadRequestException({
        statusCode: 400,
        ...error('ATTEMPT_EXPIRED'),
        notice: 'ATTEMPT_TIMED_OUT',
        attempt: result.timedOut,
      });
    if ('rejected' in result)
      throw new ConflictException({
        statusCode: 409,
        ...error(result.rejected),
      });
    return LearnerAttemptAnswerResponseDto.from(result.saved);
  }

  /**
   * Idempotent submission. Exactly one request grades an attempt:
   *
   * 1. lock the row FOR UPDATE; SUBMITTED/TIMED_OUT -> the stored result
   *    (200, nothing recomputed); SUBMITTING -> 409 SUBMISSION_IN_PROGRESS;
   *    past deadline + grace -> auto-submitted TIMED_OUT;
   * 2. IN_PROGRESS -> SUBMITTING, committed, so every concurrent or retried
   *    request now sees the claim instead of grading again;
   * 3. grade from the snapshot and close as SUBMITTED, stamped with the
   *    moment of the claim, in a second transaction that re-locks the row
   *    and only acts while its own claim is still current.
   *
   * A claim whose request died (older than SUBMISSION_LEASE_SECONDS) is
   * taken over by the next submit; grading is deterministic, so finishing it
   * twice cannot produce a different result.
   */
  async submit(
    principal: Principal,
    attemptId: string,
    dto: SubmitQuizDto = {},
  ) {
    await this.assertOwnAttempt(principal, attemptId);
    const claim = await this.transaction(
      async (
        manager,
      ): Promise<
        | { done: LearnerAttemptResponseDto }
        | { token: string; submittedAt: string }
        | Rejected
      > => {
        const attempt = await this.lockAttempt(manager, attemptId);
        switch (attempt.status) {
          case QuizAttemptStatus.SUBMITTED:
          case QuizAttemptStatus.TIMED_OUT:
          case QuizAttemptStatus.COMPLETED:
          case QuizAttemptStatus.NEEDS_GRADING:
          case QuizAttemptStatus.GRADED:
            return { done: await this.view(manager, attempt) };
          case QuizAttemptStatus.ABANDONED:
            return { rejected: 'ATTEMPT_NOT_IN_PROGRESS' };
          case QuizAttemptStatus.SUBMITTING:
            if (!attempt.leaseExpired)
              return { rejected: 'SUBMISSION_IN_PROGRESS' };
            return {
              token: await this.claim(manager, attempt),
              // The original claim marks when the learner submitted.
              submittedAt: attempt.submissionToken,
            };
          default: {
            const timedOut = await this.checkAndEnforceTimeout(
              manager,
              attempt,
              true,
            );
            if (timedOut) return { done: timedOut };
            await saveSubmittedAnswers(manager, attempt, dto.answers ?? []);
            await ensureEssayAnswerRows(manager, attempt);
            const token = await this.claim(manager, attempt);
            return { token, submittedAt: token };
          }
        }
      },
    );
    if ('rejected' in claim)
      throw new ConflictException({
        statusCode: 409,
        ...error(claim.rejected),
      });
    if ('done' in claim) return claim.done;

    return this.transaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);
      // Taken over after a lease expiry, and possibly finished already.
      if (
        attempt.status !== QuizAttemptStatus.SUBMITTING ||
        attempt.submissionToken !== claim.token
      )
        return this.view(manager, attempt);
      return this.gradeAndClose(
        manager,
        attempt,
        QuizAttemptStatus.COMPLETED,
        claim.submittedAt,
      );
    });
  }

  /**
   * The graded result with review details as the attempt's frozen review
   * policy allows. A running attempt past its deadline is auto-submitted
   * first; otherwise only closed attempts have a result.
   */
  async result(principal: Principal, attemptId: string) {
    await this.assertOwnAttempt(principal, attemptId);
    const result = await this.transaction(async (manager) => {
      let attempt = await this.lockAttempt(manager, attemptId);
      if (
        (await this.settleStaleSubmission(manager, attempt)) ||
        (await this.checkAndEnforceTimeout(manager, attempt))
      )
        attempt = await this.lockAttempt(manager, attemptId);
      if (attempt.status === QuizAttemptStatus.SUBMITTING)
        return { rejected: 'SUBMISSION_IN_PROGRESS' };
      if (
        attempt.status !== QuizAttemptStatus.SUBMITTED &&
        attempt.status !== QuizAttemptStatus.TIMED_OUT &&
        attempt.status !== QuizAttemptStatus.COMPLETED &&
        attempt.status !== QuizAttemptStatus.NEEDS_GRADING &&
        attempt.status !== QuizAttemptStatus.GRADED
      )
        return { rejected: 'ATTEMPT_NOT_SUBMITTED' };

      const answers = await manager.query<GradedAnswerRow[]>(
        `SELECT question_id AS "questionId",
           selected_option_ids AS "selectedOptionIds",
           is_correct AS "isCorrect", points_earned AS "pointsEarned", grading
         FROM attempt_answers WHERE attempt_id = $1`,
        [attempt.id],
      );
      const [history] = await manager.query<
        Array<{ attemptsUsed: number; hasOpenAttempt: boolean }>
      >(
        `SELECT count(*)::int AS "attemptsUsed",
           coalesce(bool_or(status IN ('IN_PROGRESS', 'SUBMITTING')), false)
             AS "hasOpenAttempt"
         FROM quiz_attempts WHERE user_id = $1 AND quiz_id = $2`,
        [attempt.userId, attempt.quizId],
      );
      return {
        result: buildAttemptResult(
          attempt,
          answers,
          !isScoreConcealed(attempt.status) &&
            isReviewAllowed(attempt.quizSnapshot.quiz, attempt, history!),
          // Recomputed from the stored answers by the one scoring service.
          attempt.status === QuizAttemptStatus.COMPLETED
            ? toBreakdownDto(calculateScore(attempt.quizSnapshot, answers))
            : undefined,
          attempt.status === QuizAttemptStatus.COMPLETED
            ? await this.publishedAdjustments(manager, attempt.id)
            : undefined,
        ),
      };
    });
    if ('rejected' in result)
      throw new ConflictException({
        statusCode: 409,
        ...error(result.rejected!),
      });
    return result.result;
  }

  /**
   * Grade changes made after the result was published, for the learner's
   * "score updated" notice. Only dates and (by policy) the reasons: never who
   * changed what.
   */
  private async publishedAdjustments(
    manager: EntityManager,
    attemptId: string,
  ) {
    const rows = await manager.query<
      Array<{ adjustedAt: Date; reason: string | null }>
    >(
      `SELECT created_at AS "adjustedAt", adjustment_reason AS reason
       FROM quiz_grade_audit_logs
       WHERE attempt_id = $1 AND was_published ORDER BY created_at, id`,
      [attemptId],
    );
    if (!rows.length) return undefined;
    return {
      count: rows.length,
      lastAdjustedAt: rows[rows.length - 1]!.adjustedAt,
      adjustments: rows.map(({ adjustedAt, reason }) => ({
        adjustedAt,
        reason: SHOW_ADJUSTMENT_REASON_TO_LEARNER ? reason : null,
      })),
    };
  }

  /** IN_PROGRESS/SUBMITTING -> SUBMITTING; returns the claim's token. */
  private async claim(manager: EntityManager, attempt: LockedAttempt) {
    // A SUBMITTING claim whose lease expired is re-claimed: same state.
    if (attempt.status !== QuizAttemptStatus.SUBMITTING)
      assertTransition(attempt.status, QuizAttemptStatus.SUBMITTING);
    const [[row]] = await manager.query<[Array<{ token: string }>, number]>(
      `UPDATE quiz_attempts SET status = 'SUBMITTING'
       WHERE id = $1 RETURNING updated_at::text AS token`,
      [attempt.id],
    );
    return row!.token;
  }

  /**
   * Finishes a SUBMITTING claim whose request died (lease expired), as
   * SUBMITTED at the moment of the claim. Null when there is nothing to do.
   */
  private async settleStaleSubmission(
    manager: EntityManager,
    attempt: LockedAttempt,
  ) {
    if (attempt.status !== QuizAttemptStatus.SUBMITTING) return null;
    if (!attempt.leaseExpired) return null;
    return this.gradeAndClose(
      manager,
      attempt,
      QuizAttemptStatus.COMPLETED,
      attempt.submissionToken,
    );
  }

  /**
   * Lazy expiration, run first by every touchpoint (start, active-attempt,
   * answers, submit) on a locked IN_PROGRESS attempt. Past the deadline
   * (plus the grace period when `grace`), it auto-submits: grades the
   * answers saved so far, which the database froze at the deadline since
   * saves are refused after it, and closes the attempt TIMED_OUT with
   * submitted_at = expires_at. Returns the closed attempt, or null while
   * time remains.
   */
  private async checkAndEnforceTimeout(
    manager: EntityManager,
    attempt: LockedAttempt,
    grace = false,
  ) {
    if (attempt.status !== QuizAttemptStatus.IN_PROGRESS) return null;
    if (!(grace ? attempt.pastGrace : attempt.expired)) return null;
    return this.gradeAndClose(manager, attempt, QuizAttemptStatus.TIMED_OUT);
  }

  /** Learner mutations also require the learner to still have access. */
  private async assertOwnAttempt(principal: Principal, attemptId: string) {
    const [owner] = await this.dataSource.query<
      Array<{ userId: string; quizId: string }>
    >(
      'SELECT user_id AS "userId", quiz_id AS "quizId" FROM quiz_attempts WHERE id = $1',
      [attemptId],
    );
    // Someone else's attempt is indistinguishable from a missing one.
    if (!owner || owner.userId !== principal.id)
      throw new NotFoundException(ATTEMPT_NOT_FOUND);
    await this.access.assertCanTake(
      principal,
      await this.access.loadQuiz(owner.quizId),
    );
  }

  private async lockActive(
    manager: EntityManager,
    userId: string,
    quizId: string,
  ) {
    const [attempt] = await manager.query<LockedAttempt[]>(
      `SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts
       WHERE user_id = $1 AND quiz_id = $2
         AND status IN ('IN_PROGRESS', 'SUBMITTING')
       FOR UPDATE`,
      [userId, quizId],
    );
    return attempt ?? null;
  }

  private async lockAttempt(manager: EntityManager, attemptId: string) {
    const [attempt] = await manager.query<LockedAttempt[]>(
      `SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts WHERE id = $1 FOR UPDATE`,
      [attemptId],
    );
    if (!attempt) throw new NotFoundException(ATTEMPT_NOT_FOUND);
    return attempt;
  }

  /**
   * The grading pipeline (Q17): grades from the snapshot and the saved
   * answers only, and closes the attempt in the caller's transaction.
   * TIMED_OUT is stamped at the deadline; SUBMITTED at `submittedAt` (the
   * submission claim) or now.
   */
  private async gradeAndClose(
    manager: EntityManager,
    attempt: LockedAttempt,
    status: QuizAttemptStatus.COMPLETED | QuizAttemptStatus.TIMED_OUT,
    submittedAt: string | null = null,
  ) {
    const saved = await manager.query<
      Array<{
        questionId: string;
        selectedOptionIds: string[];
        essayAnswer: EssayAnswer | null;
      }>
    >(
      `SELECT question_id AS "questionId", selected_option_ids AS "selectedOptionIds",
         essay_answer AS "essayAnswer"
       FROM attempt_answers WHERE attempt_id = $1`,
      [attempt.id],
    );
    const grade = gradeAttempt(attempt.quizSnapshot, saved);
    const hasEssayQuestions = attempt.quizSnapshot.questions.some(
      ({ type }) => type === QuizQuestionType.ESSAY,
    );
    if (attempt.status === QuizAttemptStatus.IN_PROGRESS)
      await ensureEssayAnswerRows(manager, attempt);
    const objectiveAnswers = grade.answers.filter(
      (answer): answer is typeof answer & { isCorrect: boolean } =>
        answer.isCorrect !== null,
    );
    if (objectiveAnswers.length)
      await manager.query(
        `UPDATE attempt_answers answer
         SET is_correct = graded.is_correct, points_earned = graded.points
         FROM unnest($2::uuid[], $3::boolean[], $4::int[])
           AS graded(question_id, is_correct, points)
         WHERE answer.attempt_id = $1
           AND answer.question_id = graded.question_id`,
        [
          attempt.id,
          objectiveAnswers.map(({ questionId }) => questionId),
          objectiveAnswers.map(({ isCorrect }) => isCorrect),
          objectiveAnswers.map(({ pointsEarned }) => pointsEarned),
        ],
      );
    if (hasEssayQuestions)
      await manager.query(
        `UPDATE attempt_answers
         SET is_correct = NULL, points_earned = 0,
           grading = $2::jsonb
         WHERE attempt_id = $1
           AND question_id = ANY($3::uuid[])`,
        [
          attempt.id,
          JSON.stringify({
            status: EssayGradingStatus.UNGRADED,
            awardedPoints: null,
          }),
          attempt.quizSnapshot.questions
            .filter(({ type }) => type === QuizQuestionType.ESSAY)
            .map(({ id }) => id),
        ],
      );
    const finalStatus = hasEssayQuestions
      ? QuizAttemptStatus.NEEDS_GRADING
      : status;
    assertTransition(attempt.status, finalStatus);
    const { courseId } = attempt.quizSnapshot.quiz;
    if (courseId && finalStatus !== QuizAttemptStatus.NEEDS_GRADING)
      this.closedIn.get(manager)?.push({ userId: attempt.userId, courseId });
    // A timed-out attempt is submitted at its deadline, however late we look.
    // TypeORM answers UPDATE ... RETURNING on PostgreSQL with [rows, count].
    const [[closed]] = await manager.query<[LockedAttempt[], number]>(
      `UPDATE quiz_attempts
         SET status = $2::"QuizAttemptStatus",
          published_at = CASE WHEN $10 THEN clock_timestamp() END,
          submitted_at = CASE WHEN $9
           THEN LEAST(expires_at, clock_timestamp())
           ELSE coalesce($8::timestamptz, clock_timestamp()) END,
         score = $3, is_passed = $4, earned_points = $5, total_points = $6,
         percentage = $7
       WHERE id = $1
       RETURNING ${ATTEMPT_COLUMNS}`,
      [
        attempt.id,
        finalStatus,
        grade.score,
        grade.isPassed,
        grade.earnedPoints,
        grade.totalPoints,
        grade.percentage.toFixed(2),
        submittedAt,
        status === QuizAttemptStatus.TIMED_OUT,
        // Nothing awaits an instructor: the result is visible at once.
        finalStatus !== QuizAttemptStatus.NEEDS_GRADING,
      ],
    );
    return LearnerAttemptResponseDto.from(closed!, null);
  }

  private async view(manager: EntityManager, attempt: LockedAttempt) {
    if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
      return LearnerAttemptResponseDto.from(attempt, null);
    const answers = await manager.query<SavedAnswerRow[]>(
      `SELECT question_id AS "questionId",
          selected_option_ids AS "selectedOptionIds",
          essay_answer AS "essayAnswer", saved_at AS "savedAt"
       FROM attempt_answers WHERE attempt_id = $1 ORDER BY saved_at, question_id`,
      [attempt.id],
    );
    return LearnerAttemptResponseDto.from(attempt, answers);
  }

  private async courseIdOf(
    quiz: Parameters<QuizCourseResolverService['resolveCourseIdByQuiz']>[0],
  ) {
    try {
      return await this.resolver.resolveCourseIdByQuiz(quiz);
    } catch (reason) {
      // Only an admin preview reaches here with a dangling target.
      if (reason instanceof QuizTargetNotFoundError) return null;
      throw reason;
    }
  }
}

const invalid = (code: string) =>
  new BadRequestException({ statusCode: 400, ...error(code) });

type AnswerInput = {
  questionId: string;
  selectedOptionId?: string;
  selectedOptionIds?: string[];
  essayAnswer?: EssayAnswer;
};

// `draft` relaxes what only a final submission needs: an essay may be empty
// or over its word limit while the learner is still typing.
function normalizedAnswer(
  attempt: LockedAttempt,
  answer: AnswerInput,
  draft = false,
) {
  const question = attempt.quizSnapshot.questions.find(
    ({ id }) => id === answer.questionId,
  );
  if (!question) throw invalid('QUESTION_NOT_IN_SNAPSHOT');

  if (question.type === QuizQuestionType.ESSAY) {
    if (
      answer.essayAnswer === undefined ||
      answer.selectedOptionId !== undefined ||
      answer.selectedOptionIds !== undefined
    )
      throw invalid('INVALID_RESPONSE_TYPE');
    const config = question.essayConfig;
    if (!config) throw invalid('INVALID_ESSAY_CONFIG');
    const text = answer.essayAnswer.text;
    const attachments = answer.essayAnswer.attachments ?? [];
    if (!draft && !text?.trim() && attachments.length === 0)
      throw invalid('ESSAY_ANSWER_REQUIRED');
    if (
      text?.trim() &&
      !config.allowedSubmissionTypes.includes(
        EssaySubmissionType.TEXT_WITH_KATEX,
      )
    )
      throw invalid('ESSAY_TEXT_NOT_ALLOWED');
    if (
      attachments.length > 0 &&
      !config.allowedSubmissionTypes.includes(EssaySubmissionType.FILE_UPLOAD)
    )
      throw invalid('ESSAY_ATTACHMENTS_NOT_ALLOWED');
    const cloud = cloudinaryConfig();
    if (
      cloud &&
      attachments.some(({ url }) => !isCloudinaryUrl(url, cloud.cloudName))
    )
      throw invalid('ESSAY_ATTACHMENT_URL_NOT_ALLOWED');
    if (attachments.length > config.maxFileUploads)
      throw invalid('ESSAY_ATTACHMENT_LIMIT_EXCEEDED');
    if (
      !draft &&
      config.maxWords !== undefined &&
      text?.trim() &&
      text.trim().split(/\s+/u).length > config.maxWords
    )
      throw invalid('ESSAY_WORD_LIMIT_EXCEEDED');
    return {
      selectedOptionIds: [] as string[],
      essayAnswer: {
        ...(text !== undefined && { text }),
        ...(answer.essayAnswer.attachments !== undefined && { attachments }),
      } satisfies EssayAnswer,
    };
  }

  if (answer.essayAnswer !== undefined) throw invalid('INVALID_RESPONSE_TYPE');
  if (
    answer.selectedOptionId !== undefined &&
    answer.selectedOptionIds !== undefined
  )
    throw invalid('INVALID_RESPONSE_TYPE');
  const selected =
    answer.selectedOptionIds ??
    (answer.selectedOptionId === undefined ? [] : [answer.selectedOptionId]);
  const optionIds = new Set(question.options.map(({ id }) => id));
  if (!selected.every((id) => optionIds.has(id)))
    throw invalid('INVALID_OPTION_FOR_QUESTION');
  if (question.type === QuizQuestionType.SINGLE_CHOICE && selected.length > 1)
    throw invalid('INVALID_RESPONSE_TYPE');
  return { selectedOptionIds: selected, essayAnswer: null };
}

async function upsertAnswer(
  manager: EntityManager,
  attempt: LockedAttempt,
  answer: AnswerInput,
  draft = false,
) {
  const normalized = normalizedAnswer(attempt, answer, draft);
  const [saved] = await manager.query<SavedAnswerRow[]>(
    `INSERT INTO attempt_answers(
       attempt_id, question_id, selected_option_ids, essay_answer, grading,
       saved_at
     ) VALUES ($1, $2, $3::uuid[], $4::jsonb, NULL, clock_timestamp())
     ON CONFLICT (attempt_id, question_id) DO UPDATE
       SET selected_option_ids = EXCLUDED.selected_option_ids,
           essay_answer = EXCLUDED.essay_answer,
           grading = NULL,
           is_correct = NULL,
           points_earned = 0,
           saved_at = EXCLUDED.saved_at
     RETURNING question_id AS "questionId",
       selected_option_ids AS "selectedOptionIds",
       essay_answer AS "essayAnswer", saved_at AS "savedAt"`,
    [
      attempt.id,
      answer.questionId,
      normalized.selectedOptionIds,
      normalized.essayAnswer === null
        ? null
        : JSON.stringify(normalized.essayAnswer),
    ],
  );
  return saved!;
}

async function saveSubmittedAnswers(
  manager: EntityManager,
  attempt: LockedAttempt,
  answers: SubmitAnswerDto[],
) {
  if (
    new Set(answers.map(({ questionId }) => questionId)).size !== answers.length
  )
    throw invalid('DUPLICATE_QUESTION_ANSWER');
  for (const answer of answers) await upsertAnswer(manager, attempt, answer);
}

async function ensureEssayAnswerRows(
  manager: EntityManager,
  attempt: LockedAttempt,
) {
  const questionIds = attempt.quizSnapshot.questions
    .filter(({ type }) => type === QuizQuestionType.ESSAY)
    .map(({ id }) => id);
  if (!questionIds.length) return;
  await manager.query(
    `INSERT INTO attempt_answers(
       attempt_id, question_id, selected_option_ids, essay_answer, grading,
       saved_at
     )
     SELECT $1, question_id, '{}', NULL, NULL, clock_timestamp()
     FROM unnest($2::uuid[]) AS question_id
     ON CONFLICT (attempt_id, question_id) DO NOTHING`,
    [attempt.id, questionIds],
  );
}

type GradedAnswerRow = {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean | null;
  pointsEarned: number | null;
};
