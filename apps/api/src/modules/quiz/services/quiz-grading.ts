import type { QuizAttemptSnapshot } from './quiz-attempt-snapshot.js';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';
import { calculateScore } from './quiz-score-calculator.service.js';

export { percentHundredths } from './quiz-score-calculator.service.js';

export type SavedAnswer = { questionId: string; selectedOptionIds: string[] };
export type GradedAnswer = {
  questionId: string;
  isCorrect: boolean | null;
  pointsEarned: number;
};
export type AttemptGrade = {
  answers: GradedAnswer[];
  earnedPoints: number;
  totalPoints: number;
  // earnedPoints * 100 / totalPoints rounded half up to 2 decimals; exactly
  // representable as numeric(5,2).
  percentage: number;
  // Whole percentage, floor(percentage): with an integer passingScore,
  // score >= passingScore exactly when isPassed.
  score: number;
  isPassed: boolean | null;
};

/**
 * The provisional grade taken at submission: MCQ questions auto-graded, essay
 * questions left at 0 for the instructor. A thin adapter: every formula
 * (points, percentage, pass mark) is QuizScoreCalculator's, so submission and
 * final grading can never disagree.
 */
export function gradeAttempt(
  snapshot: QuizAttemptSnapshot,
  saved: SavedAnswer[],
): AttemptGrade {
  const breakdown = calculateScore(snapshot, saved);
  const mcq = new Map(
    breakdown.mcqQuestions.map((question) => [question.questionId, question]),
  );
  const hasEssayQuestions = snapshot.questions.some(
    ({ type }) => type === QuizQuestionType.ESSAY,
  );
  return {
    answers: snapshot.questions.map((question): GradedAnswer => {
      const graded = mcq.get(question.id);
      return graded
        ? graded
        : { questionId: question.id, isCorrect: null, pointsEarned: 0 };
    }),
    earnedPoints: breakdown.totalScore,
    totalPoints: breakdown.totalMaxScore,
    percentage: breakdown.percentage,
    score: breakdown.score,
    isPassed: hasEssayQuestions ? null : breakdown.isPassed,
  };
}
