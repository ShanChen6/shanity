import {
  BadRequestException,
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
  type SavedAnswerRow,
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
import { QuizLearnerAccessService } from './quiz-learner-access.service.js';
import { buildAttemptResult } from '../dto/quiz-attempt-result.dto.js';
import { isReviewAllowed } from './quiz-review-policy.js';

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
    const selected = selectionOf(answer);
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
        assertAnswerFitsSnapshot(attempt, answer.questionId, selected);
        const [saved] = await manager.query<SavedAnswerRow[]>(
          `INSERT INTO attempt_answers(attempt_id, question_id, selected_option_ids, saved_at)
         VALUES ($1, $2, $3::uuid[], clock_timestamp())
         ON CONFLICT (attempt_id, question_id) DO UPDATE
           SET selected_option_ids = EXCLUDED.selected_option_ids,
               saved_at = EXCLUDED.saved_at
         RETURNING question_id AS "questionId",
           selected_option_ids AS "selectedOptionIds", saved_at AS "savedAt"`,
          [attemptId, answer.questionId, selected],
        );
        return { saved: saved! };
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
  async submit(principal: Principal, attemptId: string) {
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
            return { done: await this.view(manager, attempt) };
          case QuizAttemptStatus.ABANDONED:
            return { rejected: 'ATTEMPT_NOT_IN_PROGRESS' };
          case QuizAttemptStatus.SUBMITTING:
            if (!attempt.leaseExpired)
              return { rejected: 'SUBMISSION_IN_PROGRESS' };
            return {
              token: await this.claim(manager, attempt.id),
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
            const token = await this.claim(manager, attempt.id);
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
        QuizAttemptStatus.SUBMITTED,
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
        attempt.status !== QuizAttemptStatus.TIMED_OUT
      )
        return { rejected: 'ATTEMPT_NOT_SUBMITTED' };

      const answers = await manager.query<GradedAnswerRow[]>(
        `SELECT question_id AS "questionId",
           selected_option_ids AS "selectedOptionIds",
           is_correct AS "isCorrect", points_earned AS "pointsEarned"
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
          isReviewAllowed(attempt.quizSnapshot.quiz, attempt, history!),
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

  /** IN_PROGRESS/SUBMITTING -> SUBMITTING; returns the claim's token. */
  private async claim(manager: EntityManager, attemptId: string) {
    const [[row]] = await manager.query<[Array<{ token: string }>, number]>(
      `UPDATE quiz_attempts SET status = 'SUBMITTING'
       WHERE id = $1 RETURNING updated_at::text AS token`,
      [attemptId],
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
      QuizAttemptStatus.SUBMITTED,
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
    status: QuizAttemptStatus.SUBMITTED | QuizAttemptStatus.TIMED_OUT,
    submittedAt: string | null = null,
  ) {
    const saved = await manager.query<
      Array<{ questionId: string; selectedOptionIds: string[] }>
    >(
      `SELECT question_id AS "questionId", selected_option_ids AS "selectedOptionIds"
       FROM attempt_answers WHERE attempt_id = $1`,
      [attempt.id],
    );
    const grade = gradeAttempt(attempt.quizSnapshot, saved);
    const { courseId } = attempt.quizSnapshot.quiz;
    if (courseId)
      this.closedIn.get(manager)?.push({ userId: attempt.userId, courseId });
    await manager.query(
      `UPDATE attempt_answers answer
       SET is_correct = graded.is_correct, points_earned = graded.points
       FROM unnest($2::uuid[], $3::boolean[], $4::int[])
         AS graded(question_id, is_correct, points)
       WHERE answer.attempt_id = $1 AND answer.question_id = graded.question_id`,
      [
        attempt.id,
        grade.answers.map(({ questionId }) => questionId),
        grade.answers.map(({ isCorrect }) => isCorrect),
        grade.answers.map(({ pointsEarned }) => pointsEarned),
      ],
    );
    // A timed-out attempt is submitted at its deadline, however late we look.
    // TypeORM answers UPDATE ... RETURNING on PostgreSQL with [rows, count].
    const [[closed]] = await manager.query<[LockedAttempt[], number]>(
      `UPDATE quiz_attempts
       SET status = $2::"QuizAttemptStatus",
         submitted_at = CASE WHEN $2 = 'TIMED_OUT'
           THEN LEAST(expires_at, clock_timestamp())
           ELSE coalesce($8::timestamptz, clock_timestamp()) END,
         score = $3, is_passed = $4, earned_points = $5, total_points = $6,
         percentage = $7
       WHERE id = $1
       RETURNING ${ATTEMPT_COLUMNS}`,
      [
        attempt.id,
        status,
        grade.score,
        grade.isPassed,
        grade.earnedPoints,
        grade.totalPoints,
        grade.percentage.toFixed(2),
        submittedAt,
      ],
    );
    return LearnerAttemptResponseDto.from(closed!, null);
  }

  private async view(manager: EntityManager, attempt: LockedAttempt) {
    if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
      return LearnerAttemptResponseDto.from(attempt, null);
    const answers = await manager.query<SavedAnswerRow[]>(
      `SELECT question_id AS "questionId",
         selected_option_ids AS "selectedOptionIds", saved_at AS "savedAt"
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

/** `selectedOptionId` for one option, `selectedOptionIds` for a set. */
function selectionOf({
  selectedOptionId,
  selectedOptionIds,
}: SaveAttemptAnswerDto) {
  if (selectedOptionId !== undefined && selectedOptionIds !== undefined)
    throw invalid('INVALID_RESPONSE_TYPE');
  return selectedOptionIds ?? [selectedOptionId!];
}

/** The answer must address the attempt's own frozen question and options. */
function assertAnswerFitsSnapshot(
  attempt: LockedAttempt,
  questionId: string,
  selected: string[],
) {
  const question = attempt.quizSnapshot.questions.find(
    ({ id }) => id === questionId,
  );
  if (!question) throw invalid('QUESTION_NOT_IN_SNAPSHOT');
  const optionIds = new Set(question.options.map(({ id }) => id));
  if (!selected.every((id) => optionIds.has(id)))
    throw invalid('INVALID_OPTION_FOR_QUESTION');
  if (question.type === QuizQuestionType.SINGLE_CHOICE && selected.length > 1)
    throw invalid('INVALID_RESPONSE_TYPE');
}

type GradedAnswerRow = {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean | null;
  pointsEarned: number | null;
};
