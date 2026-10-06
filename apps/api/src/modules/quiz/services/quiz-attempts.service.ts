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
import { gradeAttempt } from './quiz-grading.js';
import {
  QuizLearnerAccessService,
  quizForbidden,
} from './quiz-learner-access.service.js';

type LockedAttempt = AttemptSource & { userId: string; expired: boolean };
// Rejections are returned, not thrown, so the transaction commits first.
type Rejected = { rejected: string };
type Started = { created: boolean; attempt: LearnerAttemptResponseDto };

// The database clock is authoritative for deadlines; clock_timestamp() (not
// now()) so time spent waiting for a lock counts.
const ATTEMPT_COLUMNS = `id, user_id AS "userId", quiz_id AS "quizId",
  attempt_number AS "attemptNumber", quiz_snapshot AS "quizSnapshot", status,
  started_at AS "startedAt", expires_at AS "expiresAt",
  submitted_at AS "submittedAt", score, is_passed AS "isPassed",
  (expires_at IS NOT NULL AND clock_timestamp() >= expires_at) AS expired,
  clock_timestamp() AS "serverNow"`;

const error = (code: string) => ({ message: code, code });
const ATTEMPT_NOT_FOUND = { statusCode: 404, ...error('ATTEMPT_NOT_FOUND') };

@Injectable()
export class QuizAttemptsService {
  // Overridable so tests can pin the order; production always shuffles securely.
  shuffle: ShuffleFn = secureShuffle;

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: QuizLearnerAccessService,
    private readonly resolver: QuizCourseResolverService,
  ) {}

  /**
   * Resumes the learner's running attempt, or freezes the current quiz into a
   * new one. Starts are serialized per user and quiz.
   */
  async start(principal: Principal, quizId: string) {
    await this.access.assertCanTake(
      principal,
      await this.access.loadPublishedQuiz(quizId),
    );

    const result = await this.dataSource.transaction(
      async (manager): Promise<Started | Rejected> => {
        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`quiz-attempt:${principal.id}:${quizId}`],
        );
        const active = await this.lockActive(manager, principal.id, quizId);
        if (active && !active.expired)
          return { created: false, attempt: await this.view(manager, active) };
        // Timeout consumes the attempt; it counts towards maxAttempts below.
        if (active)
          await this.close(manager, active, QuizAttemptStatus.TIMED_OUT);

        const quiz = await this.access.loadPublishedQuiz(quizId, manager);
        const [{ used }] = await manager.query<Array<{ used: number }>>(
          `SELECT count(*)::int AS used FROM quiz_attempts
         WHERE user_id = $1 AND quiz_id = $2`,
          [principal.id, quizId],
        );
        if (quiz.maxAttempts !== null && used >= quiz.maxAttempts)
          return { rejected: 'MAX_ATTEMPTS_EXCEEDED' };

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

    if ('rejected' in result) {
      if (result.rejected === 'MAX_ATTEMPTS_EXCEEDED')
        throw quizForbidden(result.rejected);
      throw new ConflictException({
        statusCode: 409,
        ...error(result.rejected),
      });
    }
    return result;
  }

  /**
   * Restores a running attempt after reload or on another device. An attempt
   * found past its deadline is closed as TIMED_OUT and graded first.
   */
  async activeAttempt(principal: Principal, quizId: string) {
    await this.access.assertCanTake(
      principal,
      await this.access.loadQuiz(quizId),
    );
    const attempt = await this.dataSource.transaction(async (manager) => {
      const active = await this.lockActive(manager, principal.id, quizId);
      if (!active) return null;
      if (active.expired)
        return this.close(manager, active, QuizAttemptStatus.TIMED_OUT);
      return this.view(manager, active);
    });
    if (!attempt)
      throw new NotFoundException({
        statusCode: 404,
        ...error('NO_ACTIVE_ATTEMPT'),
      });
    return attempt;
  }

  /** Autosave: replaces this question's selection (last write wins). */
  async saveAnswer(
    principal: Principal,
    attemptId: string,
    answer: SaveAttemptAnswerDto,
  ) {
    await this.assertOwnAttempt(principal, attemptId);
    const result = await this.dataSource.transaction(
      async (manager): Promise<{ saved: SavedAnswerRow } | Rejected> => {
        const attempt = await this.lockAttempt(manager, attemptId);
        if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
          return { rejected: 'ATTEMPT_NOT_IN_PROGRESS' };
        if (attempt.expired) {
          await this.close(manager, attempt, QuizAttemptStatus.TIMED_OUT);
          return { rejected: 'ATTEMPT_EXPIRED' };
        }
        this.assertAnswerFitsSnapshot(attempt, answer);
        const [saved] = await manager.query<SavedAnswerRow[]>(
          `INSERT INTO attempt_answers(attempt_id, question_id, selected_option_ids, saved_at)
         VALUES ($1, $2, $3::uuid[], clock_timestamp())
         ON CONFLICT (attempt_id, question_id) DO UPDATE
           SET selected_option_ids = EXCLUDED.selected_option_ids,
               saved_at = EXCLUDED.saved_at
         RETURNING question_id AS "questionId",
           selected_option_ids AS "selectedOptionIds", saved_at AS "savedAt"`,
          [attemptId, answer.questionId, answer.selectedOptionIds],
        );
        return { saved: saved! };
      },
    );
    // Thrown after commit so a detected timeout stays recorded.
    if ('rejected' in result)
      throw new ConflictException({
        statusCode: 409,
        ...error(result.rejected),
      });
    return LearnerAttemptAnswerResponseDto.from(result.saved);
  }

  /** Closes and grades the attempt; repeating it returns the same result. */
  async submit(principal: Principal, attemptId: string) {
    await this.assertOwnAttempt(principal, attemptId);
    const result = await this.dataSource.transaction(async (manager) => {
      const attempt = await this.lockAttempt(manager, attemptId);
      if (attempt.status === QuizAttemptStatus.ABANDONED) return null;
      if (attempt.status !== QuizAttemptStatus.IN_PROGRESS)
        return this.view(manager, attempt);
      // At or past the deadline, timeout wins over the submission.
      return this.close(
        manager,
        attempt,
        attempt.expired
          ? QuizAttemptStatus.TIMED_OUT
          : QuizAttemptStatus.SUBMITTED,
      );
    });
    if (!result)
      throw new ConflictException({
        statusCode: 409,
        ...error('ATTEMPT_NOT_IN_PROGRESS'),
      });
    return result;
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

  private assertAnswerFitsSnapshot(
    attempt: LockedAttempt,
    { questionId, selectedOptionIds }: SaveAttemptAnswerDto,
  ) {
    const question = attempt.quizSnapshot.questions.find(
      ({ id }) => id === questionId,
    );
    if (!question)
      throw new BadRequestException({
        statusCode: 400,
        ...error('QUESTION_NOT_IN_SNAPSHOT'),
      });
    const optionIds = new Set(question.options.map(({ id }) => id));
    if (!selectedOptionIds.every((id) => optionIds.has(id)))
      throw new BadRequestException({
        statusCode: 400,
        ...error('OPTION_NOT_IN_QUESTION'),
      });
    if (
      question.type === QuizQuestionType.SINGLE_CHOICE &&
      selectedOptionIds.length > 1
    )
      throw new BadRequestException({
        statusCode: 400,
        ...error('INVALID_RESPONSE_TYPE'),
      });
  }

  private async lockActive(
    manager: EntityManager,
    userId: string,
    quizId: string,
  ) {
    const [attempt] = await manager.query<LockedAttempt[]>(
      `SELECT ${ATTEMPT_COLUMNS} FROM quiz_attempts
       WHERE user_id = $1 AND quiz_id = $2 AND status = 'IN_PROGRESS'
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
   * Grades from the snapshot and closes the attempt in the caller's
   * transaction. Answers are written first: the database freezes them once
   * the attempt leaves IN_PROGRESS.
   */
  private async close(
    manager: EntityManager,
    attempt: LockedAttempt,
    status: QuizAttemptStatus.SUBMITTED | QuizAttemptStatus.TIMED_OUT,
  ) {
    const saved = await manager.query<
      Array<{ questionId: string; selectedOptionIds: string[] }>
    >(
      `SELECT question_id AS "questionId", selected_option_ids AS "selectedOptionIds"
       FROM attempt_answers WHERE attempt_id = $1`,
      [attempt.id],
    );
    const grade = gradeAttempt(attempt.quizSnapshot, saved);
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
           THEN LEAST(expires_at, clock_timestamp()) ELSE clock_timestamp() END,
         score = $3, is_passed = $4
       WHERE id = $1
       RETURNING ${ATTEMPT_COLUMNS}`,
      [attempt.id, status, grade.score, grade.isPassed],
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
