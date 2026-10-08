import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CourseProgressCalculatorService } from '../../progress/services/course-progress-calculator.service.js';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
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
import type { QuizAttemptSnapshot } from './quiz-attempt-snapshot.js';
import {
  QuizScoreCalculatorService,
  toBreakdownDto,
} from './quiz-score-calculator.service.js';

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
  publishedAt?: Date | null;
};

type GradedJson = Extract<
  EssayGradingJson,
  { status: EssayGradingStatus.GRADED }
>;
type Planned = {
  grade: {
    questionId: string;
    awardedPoints: number;
    rubricScores: Array<{ criterionIndex: number; score: number }>;
    feedback: string;
  };
  row: { id: string; questionId: string; grading: EssayGradingJson | null };
  // The grade being replaced; null for a first grading.
  old: GradedJson | null;
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
    private readonly calculator: QuizScoreCalculatorService,
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
      publishedAt: attempt.publishedAt ?? null,
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
   * Saves grades for essay questions, for the first time or as an
   * adjustment.
   *
   * - First grading (NEEDS_GRADING): when the last UNGRADED essay is graded
   *   the attempt becomes GRADED with its final score, still private until
   *   QuizPublishService publishes it.
   * - Adjustment (a question that already has a grade, in any state): never
   *   a silent overwrite. Each changed grade writes an immutable
   *   quiz_grade_audit_logs row (who, when, old/new points, feedback, rubric,
   *   reason), and a GRADED or published attempt is re-scored in place by the
   *   score calculator. Once the result is published the reason is mandatory.
   * - A grade identical to the stored one changes nothing and logs nothing.
   *
   * The whole request is one transaction holding the attempt and its answer
   * rows FOR UPDATE; any rejection saves nothing.
   */
  async grade(
    principal: Principal,
    attemptId: string,
    dto: GradeQuizAttemptDto,
  ) {
    await this.authorized(principal, attemptId);
    const outcome = await this.dataSource.transaction(async (manager) => {
      const attempt = await this.lock(manager, attemptId);
      const gradable = [
        QuizAttemptStatus.NEEDS_GRADING,
        QuizAttemptStatus.GRADED,
        QuizAttemptStatus.COMPLETED,
      ];
      if (!gradable.includes(attempt.status))
        throw new ConflictException({
          statusCode: 409,
          message: 'ATTEMPT_NOT_AWAITING_GRADING',
          code: 'ATTEMPT_NOT_AWAITING_GRADING',
        });
      const published = attempt.status === QuizAttemptStatus.COMPLETED;

      const validated = this.validate(attempt.quizSnapshot, dto.grades);
      const reason = dto.adjustmentReason?.trim() || null;

      // What is stored now, locked so no other grader changes it meanwhile.
      const current = await manager.query<
        Array<{
          id: string;
          questionId: string;
          grading: EssayGradingJson | null;
        }>
      >(
        `SELECT id, question_id AS "questionId", grading
         FROM attempt_answers
         WHERE attempt_id = $1 AND question_id = ANY($2::uuid[]) FOR UPDATE`,
        [attempt.id, validated.map(({ questionId }) => questionId)],
      );
      const byQuestion = new Map(current.map((row) => [row.questionId, row]));

      const plan = validated.flatMap((grade): Planned[] => {
        const row = byQuestion.get(grade.questionId);
        if (!row) throw bad('Essay answer not found', 'ESSAY_ANSWER_NOT_FOUND');
        const old =
          row.grading?.status === EssayGradingStatus.GRADED
            ? row.grading
            : null;
        if (!old) return [{ grade, row, old: null }];
        const changed =
          old.awardedPoints !== grade.awardedPoints ||
          (old.feedback ?? '').trim() !== grade.feedback ||
          JSON.stringify(sortedRubric(old.rubricScores)) !==
            JSON.stringify(sortedRubric(grade.rubricScores));
        return changed ? [{ grade, row, old }] : [];
      });
      const adjustments = plan.filter(({ old }) => old !== null);
      if (published && adjustments.length && !reason)
        throw bad(
          'A reason must be provided when adjusting scores for published attempts.',
          'ADJUSTMENT_REASON_REQUIRED',
        );

      const gradedAt = new Date().toISOString();
      for (const { grade, row, old } of plan) {
        if (old)
          await manager.query(
            `INSERT INTO quiz_grade_audit_logs(
               quiz_answer_id, attempt_id, question_id, adjusted_by,
               old_score, new_score, old_feedback, new_feedback,
               old_rubric_scores, new_rubric_scores, adjustment_reason,
               was_published
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
               $11, $12)`,
            [
              row.id,
              attempt.id,
              grade.questionId,
              principal.id,
              old.awardedPoints,
              grade.awardedPoints,
              old.feedback?.trim() || null,
              grade.feedback || null,
              JSON.stringify(old.rubricScores ?? []),
              JSON.stringify(grade.rubricScores),
              reason,
              published,
            ],
          );
        const grading: EssayGradingJson = {
          status: EssayGradingStatus.GRADED,
          awardedPoints: grade.awardedPoints,
          rubricScores: grade.rubricScores,
          feedback: grade.feedback,
          gradedBy: principal.id,
          gradedAt,
        };
        // The DB triggers only let grading, never the student's answer,
        // change once the attempt is closed.
        await manager.query(
          `UPDATE attempt_answers
           SET grading = $2::jsonb, points_earned = $3, is_correct = NULL
           WHERE id = $1`,
          [row.id, JSON.stringify(grading), grade.awardedPoints],
        );
      }

      const adjusted = adjustments.map(({ grade }) => grade.questionId);
      if (attempt.status !== QuizAttemptStatus.NEEDS_GRADING) {
        // Already scored: re-score in place, only if something changed.
        const result = adjusted.length
          ? await this.calculator.recalculateAttempt(attempt.id, manager)
          : null;
        return { status: attempt.status, remaining: 0, result, adjusted };
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
      if (remaining > 0)
        return {
          status: QuizAttemptStatus.NEEDS_GRADING,
          remaining,
          result: null,
          adjusted,
        };

      // The last essay is graded: the domain service recomputes everything
      // from the stored answers and closes the attempt. Nothing is computed
      // here and nothing comes from the client.
      const final = await this.calculator.calculateAndFinalizeAttempt(
        attempt.id,
        manager,
      );
      return {
        status: QuizAttemptStatus.GRADED,
        remaining: 0,
        result: final,
        adjusted,
      };
    });

    // A published pass/fail may have flipped: course progress must follow.
    // (A merely GRADED score is private, so progress is not touched.)
    if (
      outcome.status === QuizAttemptStatus.COMPLETED &&
      outcome.result?.courseId
    )
      await this.progress.invalidateStudentProgress(
        outcome.result.userId,
        outcome.result.courseId,
      );
    return {
      attemptId,
      status: outcome.status,
      remainingUngradedCount: outcome.remaining,
      gradedQuestionIds: dto.grades.map(({ questionId }) => questionId),
      adjustedQuestionIds: outcome.adjusted,
      result: outcome.result && {
        earnedPoints: outcome.result.totalScore,
        totalPoints: outcome.result.totalMaxScore,
        percentage: outcome.result.percentage,
        score: outcome.result.score,
        isPassed: outcome.result.isPassed,
        breakdown: toBreakdownDto(outcome.result),
      },
    };
  }

  /**
   * The score history timeline of every essay question: each adjustment with
   * who changed what, when and why. Instructors of the course and admins only.
   */
  async getGradeHistory(principal: Principal, attemptId: string) {
    const attempt = await this.authorized(principal, attemptId);
    const logs = await this.dataSource.query<
      Array<{
        id: string;
        questionId: string;
        oldScore: string;
        newScore: string;
        oldFeedback: string | null;
        newFeedback: string | null;
        oldRubricScores: unknown;
        newRubricScores: unknown;
        adjustmentReason: string | null;
        wasPublished: boolean;
        adjustedAt: Date;
        adjustedById: string;
        adjustedByName: string;
      }>
    >(
      `SELECT log.id, log.question_id AS "questionId",
         log.old_score AS "oldScore", log.new_score AS "newScore",
         log.old_feedback AS "oldFeedback", log.new_feedback AS "newFeedback",
         log.old_rubric_scores AS "oldRubricScores",
         log.new_rubric_scores AS "newRubricScores",
         log.adjustment_reason AS "adjustmentReason",
         log.was_published AS "wasPublished", log.created_at AS "adjustedAt",
         adjuster.id AS "adjustedById", adjuster.display_name AS "adjustedByName"
       FROM quiz_grade_audit_logs log
       INNER JOIN users adjuster ON adjuster.id = log.adjusted_by
       WHERE log.attempt_id = $1 ORDER BY log.created_at, log.id`,
      [attempt.id],
    );
    const answers = await this.dataSource.query<
      Array<{ questionId: string; grading: EssayGradingJson | null }>
    >(
      `SELECT question_id AS "questionId", grading
       FROM attempt_answers WHERE attempt_id = $1`,
      [attempt.id],
    );
    const grading = new Map(answers.map((a) => [a.questionId, a.grading]));
    return {
      attemptId: attempt.id,
      status: attempt.status,
      publishedAt: attempt.publishedAt ?? null,
      questions: attempt.quizSnapshot.questions.flatMap((question, index) => {
        if (question.type !== QuizQuestionType.ESSAY) return [];
        const now = grading.get(question.id);
        const current = now?.status === EssayGradingStatus.GRADED ? now : null;
        return [
          {
            questionId: question.id,
            number: index + 1,
            content: question.content,
            maxScore: question.points,
            currentScore: current?.awardedPoints ?? null,
            currentFeedback: current?.feedback ?? null,
            adjustments: logs
              .filter(({ questionId }) => questionId === question.id)
              .map((log) => ({
                id: log.id,
                oldScore: Number(log.oldScore),
                newScore: Number(log.newScore),
                oldFeedback: log.oldFeedback,
                newFeedback: log.newFeedback,
                oldRubricScores: log.oldRubricScores,
                newRubricScores: log.newRubricScores,
                adjustedBy: {
                  id: log.adjustedById,
                  fullName: log.adjustedByName,
                },
                adjustedAt: log.adjustedAt,
                adjustmentReason: log.adjustmentReason,
                wasPublished: log.wasPublished,
              })),
          },
        ];
      }),
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
         total_points AS "totalPoints", published_at AS "publishedAt"
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

const sortedRubric = (
  scores?: Array<{ criterionIndex: number; score: number }>,
) => [...(scores ?? [])].sort((a, b) => a.criterionIndex - b.criterionIndex);

function pick<T extends object, K extends keyof T>(
  value: T | undefined,
  ...keys: K[]
) {
  return Object.fromEntries(keys.map((key) => [key, value?.[key]])) as Pick<
    T,
    K
  >;
}
