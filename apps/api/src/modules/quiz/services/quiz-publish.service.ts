import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { CourseProgressCalculatorService } from '../../progress/services/course-progress-calculator.service.js';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import { InstructorGradingQueueService } from './instructor-grading-queue.service.js';
import { assertTransition } from './quiz-attempt-state.js';
import { GRADING_ATTEMPT_FORBIDDEN } from './quiz-grading.service.js';

export const PUBLISH_QUIZ_FORBIDDEN =
  'You do not have permission to publish results for this quiz';

type Published = { attemptId: string; userId: string; courseId: string | null };

/**
 * Result publication: the one step that makes a graded attempt visible to its
 * learner. (Not to be confused with QuizPublishingService, which publishes a
 * quiz itself.)
 *
 * GRADED -> COMPLETED, stamping `published_at`. Before that the learner sees
 * no score, feedback or answers; afterwards what they see of the answer key
 * is still decided by the quiz's frozen review policy. Course progress only
 * learns of a pass here, never when the grade is merely saved.
 */
@Injectable()
export class QuizPublishService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly queue: InstructorGradingQueueService,
    private readonly progress: CourseProgressCalculatorService,
  ) {}

  /**
   * Publishes one learner's result. Idempotent for an attempt already
   * published; 409 for one that is not GRADED yet.
   */
  async publishSingleAttempt(principal: Principal, attemptId: string) {
    const [attempt] = await this.dataSource.query<
      Array<{ quizId: string; courseId: string | null }>
    >(
      `SELECT quiz_id AS "quizId",
         quiz_snapshot->'quiz'->>'courseId' AS "courseId"
       FROM quiz_attempts WHERE id = $1`,
      [attemptId],
    );
    // A missing attempt answers like a foreign one: ids cannot be probed.
    if (
      !attempt ||
      !(await this.queue.canGradeTarget(principal, {
        courseId: attempt.courseId,
        quizId: attempt.quizId,
      }))
    )
      throw new ForbiddenException(GRADING_ATTEMPT_FORBIDDEN);

    const published = await this.dataSource.transaction(async (manager) => {
      const [locked] = await manager.query<
        Array<{
          status: QuizAttemptStatus;
          userId: string;
          publishedAt: Date | null;
        }>
      >(
        `SELECT status, user_id AS "userId", published_at AS "publishedAt"
         FROM quiz_attempts WHERE id = $1 FOR UPDATE`,
        [attemptId],
      );
      if (locked!.status === QuizAttemptStatus.COMPLETED)
        return { already: true as const, publishedAt: locked!.publishedAt };
      if (locked!.status !== QuizAttemptStatus.GRADED)
        throw new ConflictException({
          statusCode: 409,
          message: 'ATTEMPT_NOT_READY_TO_PUBLISH',
          code: 'ATTEMPT_NOT_READY_TO_PUBLISH',
        });
      assertTransition(locked!.status, QuizAttemptStatus.COMPLETED);
      const [[row]] = await manager.query<
        [Array<{ publishedAt: Date }>, number]
      >(
        `UPDATE quiz_attempts
         SET status = 'COMPLETED', published_at = clock_timestamp()
         WHERE id = $1 RETURNING published_at AS "publishedAt"`,
        [attemptId],
      );
      return {
        already: false as const,
        publishedAt: row!.publishedAt,
        userId: locked!.userId,
      };
    });

    if (!published.already && attempt.courseId)
      await this.progress.invalidateStudentProgress(
        published.userId,
        attempt.courseId,
      );
    return {
      attemptId,
      status: QuizAttemptStatus.COMPLETED,
      publishedAt: published.publishedAt,
      alreadyPublished: published.already,
    };
  }

  /**
   * Publishes every GRADED attempt of a quiz in one statement. Attempts still
   * awaiting grading, and ones already published, are left untouched.
   */
  async publishBatchQuizAttempts(principal: Principal, quizId: string) {
    if (!(await this.queue.canGradeQuiz(principal, quizId)))
      throw new ForbiddenException(PUBLISH_QUIZ_FORBIDDEN);

    const [rows] = await this.dataSource.query<[Array<Published>, number]>(
      `UPDATE quiz_attempts
       SET status = 'COMPLETED', published_at = clock_timestamp()
       WHERE quiz_id = $1 AND status = 'GRADED'
       RETURNING id AS "attemptId", user_id AS "userId",
         quiz_snapshot->'quiz'->>'courseId' AS "courseId"`,
      [quizId],
    );
    const students = new Map(
      rows
        .filter(({ courseId }) => courseId)
        .map(({ userId, courseId }) => [
          `${userId}:${courseId}`,
          { userId, courseId },
        ]),
    );
    for (const { userId, courseId } of students.values())
      await this.progress.invalidateStudentProgress(userId, courseId!);

    const [{ pending }] = await this.dataSource.query<
      Array<{ pending: number }>
    >(
      `SELECT count(*)::int AS pending FROM quiz_attempts
       WHERE quiz_id = $1 AND status = 'NEEDS_GRADING'`,
      [quizId],
    );
    return {
      quizId,
      publishedCount: rows.length,
      attemptIds: rows.map(({ attemptId }) => attemptId),
      // Still waiting for the instructor to grade them.
      stillNeedGradingCount: pending,
    };
  }
}
