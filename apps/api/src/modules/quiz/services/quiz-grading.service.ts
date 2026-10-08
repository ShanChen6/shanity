import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { CourseProgressCalculatorService } from '../../progress/services/course-progress-calculator.service.js';
import {
  EssayGradingStatus,
  type EssayAnswer,
  type EssayGradingJson,
  type EssayRubricCriterion,
} from '../domain/assessment.types.js';
import type {
  GradeEssayQuestionDto,
  GradeQuizAttemptDto,
} from '../dto/grade-attempt.dto.js';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';
import { InstructorGradingQueueService } from './instructor-grading-queue.service.js';
import { assertTransition } from './quiz-attempt-state.js';
import type { QuizAttemptSnapshot } from './quiz-attempt-snapshot.js';
import { percentHundredths } from './quiz-grading.js';

export const GRADING_ATTEMPT_FORBIDDEN =
  'You do not have permission to grade this attempt';

type AttemptRow = {
  id: string;
  userId: string;
  quizId: string;
  status: QuizAttemptStatus;
  quizSnapshot: QuizAttemptSnapshot;
  submittedAt: Date | null;
  totalPoints: number | null;
};

const bad = (message: string, code: string) =>
  new BadRequestException({ statusCode: 400, message, code });

// Rubrics may use quarter points; sums are compared without float noise.
const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const rubricOf = (config: {
  rubric?: EssayRubricCriterion[];
  gradingRubric?: EssayRubricCriterion[];
}) => config.rubric ?? config.gradingRubric;

/**
 * Manual essay grading. Zero trust: the ceiling for every grade is the
 * question's own `points` in the attempt's frozen snapshot, read here from
 * the database; nothing about maxima, rubric or totals comes from the client.
 */
@Injectable()
export class QuizGradingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly queue: InstructorGradingQueueService,
    private readonly progress: CourseProgressCalculatorService,
  ) {}

  /**
   * Everything the grading screen needs: who submitted what, the essay
   * answers, the grading guide / rubric and any grade already given.
   */
  async getAttempt(principal: Principal, attemptId: string) {
    const attempt = await this.authorized(principal, attemptId);
    const [header] = await this.dataSource.query<
      Array<{
        fullName: string;
        email: string;
        courseTitle: string | null;
        courseSlug: string | null;
      }>
    >(
      `SELECT student.display_name AS "fullName", student.email,
         course.title AS "courseTitle", course.slug AS "courseSlug"
       FROM users student
       LEFT JOIN courses course ON course.id = $2
       WHERE student.id = $1`,
      [attempt.userId, attempt.quizSnapshot.quiz.courseId],
    );
    const answers = await this.dataSource.query<
      Array<{
        questionId: string;
        essayAnswer: EssayAnswer | null;
        grading: EssayGradingJson | null;
        isCorrect: boolean | null;
        pointsEarned: number | null;
        selectedOptionIds: string[];
      }>
    >(
      `SELECT question_id AS "questionId", essay_answer AS "essayAnswer",
         grading, is_correct AS "isCorrect", points_earned AS "pointsEarned",
         selected_option_ids AS "selectedOptionIds"
       FROM attempt_answers WHERE attempt_id = $1`,
      [attempt.id],
    );
    const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
    const { quiz, questions } = attempt.quizSnapshot;
    const essays = questions.filter(
      ({ type }) => type === QuizQuestionType.ESSAY,
    );
    const pending = essays.filter(
      ({ id }) => byQuestion.get(id)?.grading?.status !== 'GRADED',
    ).length;
    return {
      attemptId: attempt.id,
      status: attempt.status,
      submittedAt: attempt.submittedAt,
      student: { id: attempt.userId, ...pick(header, 'fullName', 'email') },
      quiz: { id: quiz.id, title: quiz.title },
      course: quiz.courseId
        ? {
            id: quiz.courseId,
            title: header?.courseTitle ?? '',
            slug: header?.courseSlug ?? null,
          }
        : null,
      totalEssays: essays.length,
      pendingEssaysCount: pending,
      questions: questions.map((question) => {
        const answer = byQuestion.get(question.id);
        if (question.type !== QuizQuestionType.ESSAY)
          return {
            id: question.id,
            type: question.type,
            content: question.content,
            points: question.points,
            isCorrect: answer?.isCorrect ?? false,
            pointsEarned: answer?.pointsEarned ?? 0,
          };
        const config = question.essayConfig;
        return {
          id: question.id,
          type: question.type,
          content: question.content,
          points: question.points,
          maxWords: config?.maxWords ?? null,
          gradingGuide: config?.gradingGuide ?? null,
          rubric: (config && rubricOf(config)) ?? null,
          essayAnswer: answer?.essayAnswer ?? null,
          grading: answer?.grading ?? null,
        };
      }),
    };
  }

  /**
   * Saves grades for one or several essay questions of an attempt awaiting
   * grading. When the last UNGRADED essay is graded, the attempt closes as
   * COMPLETED with its final score: MCQ points + essay points.
   */
  async grade(
    principal: Principal,
    attemptId: string,
    dto: GradeQuizAttemptDto,
  ) {
    const known = await this.authorized(principal, attemptId);
    const closed = await this.dataSource.transaction(async (manager) => {
      const attempt = await this.lock(manager, attemptId);
      if (attempt.status !== QuizAttemptStatus.NEEDS_GRADING)
        throw new ConflictException({
          statusCode: 409,
          message: 'ATTEMPT_NOT_AWAITING_GRADING',
          code: 'ATTEMPT_NOT_AWAITING_GRADING',
        });

      const validated = this.validate(attempt.quizSnapshot, dto.grades);
      const gradedAt = new Date().toISOString();
      for (const grade of validated) {
        const grading: EssayGradingJson = {
          status: EssayGradingStatus.GRADED,
          awardedPoints: grade.awardedPoints,
          rubricScores: grade.rubricScores,
          feedback: grade.feedback,
          gradedBy: principal.id,
          gradedAt,
        };
        // The answer row exists since submission; the DB triggers only let
        // grading, never the student's answer, change on a closed attempt.
        const [, updated] = await manager.query<[unknown, number]>(
          `UPDATE attempt_answers
           SET grading = $3::jsonb, points_earned = $4, is_correct = NULL
           WHERE attempt_id = $1 AND question_id = $2`,
          [
            attempt.id,
            grade.questionId,
            JSON.stringify(grading),
            grade.awardedPoints,
          ],
        );
        if (!updated)
          throw bad('Essay answer not found', 'ESSAY_ANSWER_NOT_FOUND');
      }

      const essayIds = attempt.quizSnapshot.questions
        .filter(({ type }) => type === QuizQuestionType.ESSAY)
        .map(({ id }) => id);
      const [{ graded }] = await manager.query<Array<{ graded: number }>>(
        `SELECT count(*)::int AS graded FROM attempt_answers
         WHERE attempt_id = $1 AND question_id = ANY($2::uuid[])
           AND grading->>'status' = 'GRADED'`,
        [attempt.id, essayIds],
      );
      const remaining = essayIds.length - graded!;
      if (remaining > 0) return { remaining, result: null, attempt };

      // Final score: every answer row now carries its points (MCQ at
      // submission, essays just now).
      assertTransition(attempt.status, QuizAttemptStatus.COMPLETED);
      const [{ earned }] = await manager.query<Array<{ earned: number }>>(
        `SELECT coalesce(sum(points_earned), 0)::int AS earned
         FROM attempt_answers WHERE attempt_id = $1`,
        [attempt.id],
      );
      const total = attempt.totalPoints ?? 0;
      const hundredths = percentHundredths(earned!, total);
      const isPassed =
        hundredths >= attempt.quizSnapshot.quiz.passingScore * 100;
      await manager.query(
        `UPDATE quiz_attempts
         SET status = 'COMPLETED', earned_points = $2, score = $3,
           percentage = $4, is_passed = $5
         WHERE id = $1`,
        [
          attempt.id,
          earned,
          Math.floor(hundredths / 100),
          (hundredths / 100).toFixed(2),
          isPassed,
        ],
      );
      return {
        remaining: 0,
        attempt,
        result: {
          earnedPoints: earned!,
          totalPoints: total,
          percentage: hundredths / 100,
          score: Math.floor(hundredths / 100),
          isPassed,
        },
      };
    });

    // A pass can complete a course; refresh only once the grade committed.
    if (closed.result && known.quizSnapshot.quiz.courseId)
      await this.progress.invalidateStudentProgress(
        known.userId,
        known.quizSnapshot.quiz.courseId,
      );
    return {
      attemptId,
      status: closed.result
        ? QuizAttemptStatus.COMPLETED
        : QuizAttemptStatus.NEEDS_GRADING,
      remainingUngradedCount: closed.remaining,
      gradedQuestionIds: dto.grades.map(({ questionId }) => questionId),
      result: closed.result,
    };
  }

  /** Validates every grade against the frozen question; throws on the first bad one. */
  private validate(
    snapshot: QuizAttemptSnapshot,
    grades: GradeEssayQuestionDto[],
  ) {
    if (
      new Set(grades.map(({ questionId }) => questionId)).size !== grades.length
    )
      throw bad(
        'Each question may be graded once per request',
        'DUPLICATE_GRADE',
      );
    return grades.map((grade) => {
      const question = snapshot.questions.find(
        ({ id }) => id === grade.questionId,
      );
      if (!question || question.type !== QuizQuestionType.ESSAY)
        throw bad(
          'Only essay questions of this attempt can be graded',
          'QUESTION_NOT_GRADABLE',
        );
      const { awardedPoints } = grade;
      const maxScore = question.points;
      if (!Number.isFinite(awardedPoints) || awardedPoints < 0)
        throw bad(
          `Awarded points (${awardedPoints}) must not be negative`,
          'AWARDED_POINTS_NEGATIVE',
        );
      if (awardedPoints > maxScore)
        throw bad(
          `Awarded points (${awardedPoints}) exceeds maximum allowed score (${maxScore})`,
          'AWARDED_POINTS_EXCEEDS_MAX',
        );
      // Points are stored as whole numbers, like the question's own points.
      if (!Number.isInteger(awardedPoints))
        throw bad(
          'Awarded points must be a whole number',
          'AWARDED_POINTS_NOT_INTEGER',
        );

      const rubric = question.essayConfig && rubricOf(question.essayConfig);
      const rubricScores = grade.rubricScores ?? [];
      if (rubricScores.length) {
        if (!rubric)
          throw bad('This question has no rubric', 'RUBRIC_NOT_CONFIGURED');
        const seen = new Set<number>();
        let sum = 0;
        for (const { criterionIndex, score } of rubricScores) {
          const criterion = rubric[criterionIndex];
          if (!criterion || seen.has(criterionIndex))
            throw bad(
              'Unknown or repeated rubric criterion',
              'INVALID_RUBRIC_CRITERION',
            );
          seen.add(criterionIndex);
          if (score < 0 || score > criterion.maxPoints)
            throw bad(
              `Rubric score (${score}) for "${criterion.criterion}" must be between 0 and ${criterion.maxPoints}`,
              'RUBRIC_SCORE_OUT_OF_RANGE',
            );
          sum += score;
        }
        if (sum < 0 || sum > maxScore)
          throw bad(
            `Rubric total (${sum}) exceeds maximum allowed score (${maxScore})`,
            'RUBRIC_TOTAL_OUT_OF_RANGE',
          );
        if (!same(sum, awardedPoints))
          throw bad(
            `Rubric total (${sum}) must equal awarded points (${awardedPoints})`,
            'RUBRIC_TOTAL_MISMATCH',
          );
      }
      return {
        questionId: question.id,
        awardedPoints,
        rubricScores: rubricScores.map(({ criterionIndex, score }) => ({
          criterionIndex,
          score,
        })),
        feedback: grade.feedback?.trim() ?? '',
      };
    });
  }

  /** Loads the attempt and proves the caller may grade it, else 403. */
  private async authorized(principal: Principal, attemptId: string) {
    const [attempt] = await this.dataSource.query<AttemptRow[]>(
      `SELECT id, user_id AS "userId", quiz_id AS "quizId", status,
         quiz_snapshot AS "quizSnapshot", submitted_at AS "submittedAt",
         total_points AS "totalPoints"
       FROM quiz_attempts WHERE id = $1`,
      [attemptId],
    );
    // A missing attempt answers like a foreign one: ids cannot be probed.
    if (
      !attempt ||
      !(await this.queue.canGradeTarget(principal, {
        courseId: attempt.quizSnapshot.quiz.courseId,
        quizId: attempt.quizId,
      }))
    )
      throw new ForbiddenException(GRADING_ATTEMPT_FORBIDDEN);
    return attempt;
  }

  private async lock(manager: EntityManager, attemptId: string) {
    const [attempt] = await manager.query<AttemptRow[]>(
      `SELECT id, user_id AS "userId", quiz_id AS "quizId", status,
         quiz_snapshot AS "quizSnapshot", submitted_at AS "submittedAt",
         total_points AS "totalPoints"
       FROM quiz_attempts WHERE id = $1 FOR UPDATE`,
      [attemptId],
    );
    return attempt!;
  }
}

function pick<T extends object, K extends keyof T>(
  value: T | undefined,
  ...keys: K[]
) {
  return Object.fromEntries(keys.map((key) => [key, value?.[key]])) as Pick<
    T,
    K
  >;
}
