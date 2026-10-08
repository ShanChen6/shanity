import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';
import { assertTransition } from './quiz-attempt-state.js';
import type { QuizAttemptSnapshot } from './quiz-attempt-snapshot.js';

/*
 * The single place where a quiz score is computed. Every formula lives here:
 *
 *   mcqScore      = sum(points of correctly answered MCQ questions)
 *   essayScore    = sum(awarded points of graded essay questions)
 *   totalScore    = mcqScore + essayScore
 *   totalMaxScore = sum(points of every question in the attempt's snapshot)
 *   percentage    = round(totalScore / totalMaxScore * 100, 2)   (half up)
 *   isPassed      = percentage >= quiz.passingScore
 *
 * Nothing here reads a client-supplied total: MCQ points are re-derived from
 * the stored selections and the frozen answer key, essay points from the
 * instructor's saved grading, and every maximum from the frozen snapshot.
 */

/** What is stored per answer row; the only inputs the calculator trusts. */
export type StoredAnswer = {
  questionId: string;
  selectedOptionIds: string[];
  grading?: {
    status?: string;
    awardedPoints?: number | null;
  } | null;
};

export type EssayScore = {
  questionId: string;
  /** 1-based position in the attempt's question order. */
  number: number;
  awardedPoints: number;
  maxScore: number;
  graded: boolean;
  feedback: string;
};

export type McqQuestionScore = {
  questionId: string;
  isCorrect: boolean;
  pointsEarned: number;
};

export type ScoreBreakdown = {
  mcqScore: number;
  mcqMaxScore: number;
  essayScore: number;
  essayMaxScore: number;
  totalScore: number;
  totalMaxScore: number;
  /** 0..100 with 2 decimals, e.g. 83.33. */
  percentage: number;
  /** floor(percentage): whole-percent score stored in quiz_attempts.score. */
  score: number;
  isPassed: boolean;
  passingScore: number;
  mcqQuestions: McqQuestionScore[];
  essays: EssayScore[];
  /** Essays still waiting for the instructor. */
  ungradedEssayCount: number;
};

/** round(earned * 100 / total, 2) * 100, half up, in exact integers. */
export function percentHundredths(earned: number, total: number) {
  if (total <= 0) return 0;
  // floor(earned * 10000 / total + 1/2) = floor((2 * earned * 10000 + total) / (2 * total))
  return Math.floor((2 * earned * 10_000 + total) / (2 * total));
}

/**
 * Scores an attempt from its frozen snapshot and stored answers. Never
 * throws: essays not yet graded simply count 0 and are reported in
 * `ungradedEssayCount`, so the same function serves the provisional score at
 * submission and the final one after grading.
 */
export function calculateScore(
  snapshot: QuizAttemptSnapshot,
  stored: StoredAnswer[],
): ScoreBreakdown {
  const byQuestion = new Map(
    stored.map((answer) => [answer.questionId, answer]),
  );
  const mcqQuestions: McqQuestionScore[] = [];
  const essays: EssayScore[] = [];
  let mcqMaxScore = 0;
  let essayMaxScore = 0;

  snapshot.questions.forEach((question, index) => {
    const answer = byQuestion.get(question.id);
    if (question.type === QuizQuestionType.ESSAY) {
      essayMaxScore += question.points;
      const graded = answer?.grading?.status === 'GRADED';
      const awarded = graded ? Number(answer?.grading?.awardedPoints ?? 0) : 0;
      essays.push({
        questionId: question.id,
        number: index + 1,
        // Defence in depth: never above the question's own maximum.
        awardedPoints: Math.min(Math.max(awarded, 0), question.points),
        maxScore: question.points,
        graded,
        feedback:
          graded &&
          typeof (answer?.grading as { feedback?: unknown }).feedback ===
            'string'
            ? (answer?.grading as { feedback: string }).feedback
            : '',
      });
      return;
    }
    mcqMaxScore += question.points;
    const selected = new Set(answer?.selectedOptionIds ?? []);
    const correct = question.options.filter((option) => option.isCorrect);
    // Exact, all-or-nothing: the selection must equal the correct set.
    const isCorrect =
      correct.length > 0 &&
      selected.size === correct.length &&
      correct.every((option) => selected.has(option.id));
    mcqQuestions.push({
      questionId: question.id,
      isCorrect,
      pointsEarned: isCorrect ? question.points : 0,
    });
  });

  const mcqScore = mcqQuestions.reduce((sum, q) => sum + q.pointsEarned, 0);
  const essayScore = essays.reduce((sum, q) => sum + q.awardedPoints, 0);
  const totalScore = mcqScore + essayScore;
  const totalMaxScore = mcqMaxScore + essayMaxScore;
  const hundredths = percentHundredths(totalScore, totalMaxScore);
  const { passingScore } = snapshot.quiz;
  return {
    mcqScore,
    mcqMaxScore,
    essayScore,
    essayMaxScore,
    totalScore,
    totalMaxScore,
    percentage: hundredths / 100,
    score: Math.floor(hundredths / 100),
    // Compared in integer hundredths, so no float error can flip a result.
    isPassed: hundredths >= passingScore * 100,
    passingScore,
    mcqQuestions,
    essays,
    ungradedEssayCount: essays.filter(({ graded }) => !graded).length,
  };
}

export const UNREVIEWED_ESSAYS_MESSAGE =
  'Cannot finalize score. Unreviewed essay questions remaining.';

/** The final score: refuses while any essay is still UNGRADED. */
export function calculateFinalScore(
  snapshot: QuizAttemptSnapshot,
  stored: StoredAnswer[],
): ScoreBreakdown {
  const breakdown = calculateScore(snapshot, stored);
  if (breakdown.ungradedEssayCount > 0)
    throw new UnprocessableEntityException({
      statusCode: 422,
      message: UNREVIEWED_ESSAYS_MESSAGE,
      code: 'UNREVIEWED_ESSAYS_REMAINING',
    });
  return breakdown;
}

/** The public shape of a score breakdown (also used by the learner's result). */
export function toBreakdownDto(breakdown: ScoreBreakdown) {
  return {
    mcq: { score: breakdown.mcqScore, maxScore: breakdown.mcqMaxScore },
    essay: {
      score: breakdown.essayScore,
      maxScore: breakdown.essayMaxScore,
      questions: breakdown.essays.map(
        ({ questionId, number, awardedPoints, maxScore, feedback }) => ({
          questionId,
          number,
          awardedPoints,
          maxScore,
          feedback,
        }),
      ),
    },
    total: { score: breakdown.totalScore, maxScore: breakdown.totalMaxScore },
    percentage: breakdown.percentage,
    isPassed: breakdown.isPassed,
  };
}

export type FinalizedAttempt = ScoreBreakdown & {
  attemptId: string;
  userId: string;
  courseId: string | null;
  status: QuizAttemptStatus.GRADED;
};

type LockedAttempt = {
  id: string;
  userId: string;
  status: QuizAttemptStatus;
  quizSnapshot: QuizAttemptSnapshot;
};

/** Domain service for scoring and finalizing attempts. */
@Injectable()
export class QuizScoreCalculatorService {
  constructor(private readonly dataSource: DataSource) {}

  /** Pure scoring from snapshot + stored answers (provisional or final). */
  calculate(snapshot: QuizAttemptSnapshot, stored: StoredAnswer[]) {
    return calculateScore(snapshot, stored);
  }

  /** Same, but only once no essay is left to grade (422 otherwise). */
  calculateFinal(snapshot: QuizAttemptSnapshot, stored: StoredAnswer[]) {
    return calculateFinalScore(snapshot, stored);
  }

  /**
   * Re-computes the whole score from the database and closes the attempt as
   * GRADED (private until the instructor publishes). Callers pass no totals and the method accepts none: it locks
   * the attempt, reads the stored answers and the frozen questions, refuses
   * (422) while an essay is ungraded, then writes score, percentage, pass
   * flag and status in one UPDATE. Joins the caller's transaction when given
   * a manager (the grading flow), otherwise runs its own.
   */
  async calculateAndFinalizeAttempt(
    attemptId: string,
    manager?: EntityManager,
  ): Promise<FinalizedAttempt> {
    if (!manager)
      return this.dataSource.transaction((own) =>
        this.calculateAndFinalizeAttempt(attemptId, own),
      );

    const [attempt] = await manager.query<LockedAttempt[]>(
      `SELECT id, user_id AS "userId", status, quiz_snapshot AS "quizSnapshot"
       FROM quiz_attempts WHERE id = $1 FOR UPDATE`,
      [attemptId],
    );
    if (!attempt)
      throw new NotFoundException({
        statusCode: 404,
        message: 'ATTEMPT_NOT_FOUND',
        code: 'ATTEMPT_NOT_FOUND',
      });
    if (
      attempt.status === QuizAttemptStatus.GRADED ||
      attempt.status === QuizAttemptStatus.COMPLETED
    )
      throw new ConflictException({
        statusCode: 409,
        message: 'ATTEMPT_ALREADY_FINALIZED',
        code: 'ATTEMPT_ALREADY_FINALIZED',
      });
    assertTransition(attempt.status, QuizAttemptStatus.GRADED);

    const stored = await manager.query<StoredAnswer[]>(
      `SELECT question_id AS "questionId",
         selected_option_ids AS "selectedOptionIds", grading
       FROM attempt_answers WHERE attempt_id = $1`,
      [attempt.id],
    );
    const breakdown = calculateFinalScore(attempt.quizSnapshot, stored);

    await manager.query(
      `UPDATE quiz_attempts
       SET status = 'GRADED', earned_points = $2, total_points = $3,
         score = $4, percentage = $5, is_passed = $6
       WHERE id = $1`,
      [
        attempt.id,
        breakdown.totalScore,
        breakdown.totalMaxScore,
        breakdown.score,
        breakdown.percentage.toFixed(2),
        breakdown.isPassed,
      ],
    );
    return {
      ...breakdown,
      attemptId: attempt.id,
      userId: attempt.userId,
      courseId: attempt.quizSnapshot.quiz.courseId,
      status: QuizAttemptStatus.GRADED,
    };
  }
}
