import type { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import type { QuizQuestionType } from '../entities/quiz-question.entity.js';
import type { AttemptSource } from './quiz-attempt.dto.js';
import {
  isScoreConcealed,
  PENDING_REVIEW_MESSAGE,
} from '../services/quiz-attempt-state.js';

/*
 * GET /quiz-attempts/:attemptId/result. One serializer for every scope, built
 * from the frozen snapshot and the graded answers, field by field. When the
 * review policy withholds details, nothing that reveals or implies the key
 * is emitted: question `isCorrect`, `pointsEarned` and `explanation` are
 * null, and options carry no `isCorrect` key at all.
 */

export class ResultOptionDto {
  id: string;
  content: string;
  // Present only when reviewAllowed.
  isCorrect?: boolean;
}

export class ResultQuestionDto {
  id: string;
  type: QuizQuestionType;
  content: string;
  points: number;
  // The one selected option; null when none or several.
  selectedOptionId: string | null;
  selectedOptionIds: string[];
  isCorrect: boolean | null;
  pointsEarned: number | null;
  explanation: string | null;
  options: ResultOptionDto[];
}

export class AttemptResultDto {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  status: QuizAttemptStatus;
  // Set when the deadline closed the attempt.
  notice?: 'ATTEMPT_TIMED_OUT';
  // False while essays await grading; `score` is then null.
  scoreVisible: boolean;
  // Set while essays await grading.
  message?: string;
  score: {
    earnedPoints: number;
    totalPoints: number;
    percentage: number;
    passingScore: number;
    passed: boolean | null;
  } | null;
  attemptInfo: {
    currentAttempt: number;
    maxAttempts: number | null;
    startedAt: Date;
    submittedAt: Date | null;
  };
  reviewPolicy: string;
  reviewAllowed: boolean;
  // In this attempt's display order.
  questions: ResultQuestionDto[];
}

type AnswerSource = {
  questionId: string;
  selectedOptionIds: string[];
  isCorrect: boolean | null;
  pointsEarned: number | null;
};

export function buildAttemptResult(
  attempt: AttemptSource,
  answers: AnswerSource[],
  reviewAllowed: boolean,
): AttemptResultDto {
  const { quiz, questions } = attempt.quizSnapshot;
  const concealed = isScoreConcealed(attempt.status);
  const byQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer]),
  );
  return Object.assign(new AttemptResultDto(), {
    attemptId: attempt.id,
    quizId: attempt.quizId,
    quizTitle: quiz.title,
    status: attempt.status,
    ...(attempt.status === 'TIMED_OUT' && {
      notice: 'ATTEMPT_TIMED_OUT' as const,
    }),
    scoreVisible: !concealed,
    ...(concealed && { message: PENDING_REVIEW_MESSAGE }),
    // The stored MCQ part is internal until the instructor finishes grading.
    score: concealed
      ? null
      : {
          earnedPoints: attempt.earnedPoints!,
          totalPoints: attempt.totalPoints!,
          percentage: attempt.percentage!,
          passingScore: quiz.passingScore,
          passed: attempt.isPassed!,
        },
    attemptInfo: {
      currentAttempt: attempt.attemptNumber,
      maxAttempts: quiz.maxAttempts,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
    },
    // Snapshots taken before the rename say ALWAYS.
    reviewPolicy:
      (quiz.reviewPolicy as string) === 'ALWAYS'
        ? 'AFTER_SUBMIT'
        : quiz.reviewPolicy,
    reviewAllowed,
    questions: questions.map((question) => {
      const answer = byQuestion.get(question.id);
      const selected = answer?.selectedOptionIds ?? [];
      return Object.assign(new ResultQuestionDto(), {
        id: question.id,
        type: question.type,
        content: question.content,
        points: question.points,
        selectedOptionId: selected.length === 1 ? selected[0] : null,
        selectedOptionIds: selected,
        // An unanswered question has no row; it was graded wrong, 0 points.
        isCorrect: reviewAllowed ? (answer?.isCorrect ?? false) : null,
        pointsEarned: reviewAllowed ? (answer?.pointsEarned ?? 0) : null,
        explanation: reviewAllowed ? question.explanation : null,
        options: question.options.map((option) =>
          Object.assign(new ResultOptionDto(), {
            id: option.id,
            content: option.content,
            ...(reviewAllowed && { isCorrect: option.isCorrect }),
          }),
        ),
      });
    }),
  });
}
