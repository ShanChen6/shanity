import type { QuizAttemptSnapshot } from './quiz-attempt-snapshot.js';

export type SavedAnswer = { questionId: string; selectedOptionIds: string[] };
export type GradedAnswer = {
  questionId: string;
  isCorrect: boolean;
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
  isPassed: boolean;
};

/**
 * The auto-grading engine. Reads only the frozen snapshot and the saved
 * answers, never authoring rows or anything the client sent about scores.
 * Exact, all-or-nothing per question: it scores when the selected set equals
 * the correct set (one option for SINGLE_CHOICE); unanswered earns zero.
 * Rounding is done in integer hundredths, so no float error can move a
 * result across the pass mark.
 */
export function gradeAttempt(
  snapshot: QuizAttemptSnapshot,
  saved: SavedAnswer[],
): AttemptGrade {
  const selections = new Map(
    saved.map((answer) => [
      answer.questionId,
      new Set(answer.selectedOptionIds),
    ]),
  );
  const answers = snapshot.questions.map((question): GradedAnswer => {
    const selected = selections.get(question.id) ?? new Set<string>();
    const correct = question.options.filter((option) => option.isCorrect);
    const isCorrect =
      correct.length > 0 &&
      selected.size === correct.length &&
      correct.every((option) => selected.has(option.id));
    return {
      questionId: question.id,
      isCorrect,
      pointsEarned: isCorrect ? question.points : 0,
    };
  });
  const totalPoints = snapshot.questions.reduce(
    (sum, question) => sum + question.points,
    0,
  );
  const earnedPoints = answers.reduce(
    (sum, answer) => sum + answer.pointsEarned,
    0,
  );
  const hundredths = percentHundredths(earnedPoints, totalPoints);
  const percentage = hundredths / 100;
  return {
    answers,
    earnedPoints,
    totalPoints,
    percentage,
    score: Math.floor(hundredths / 100),
    isPassed: hundredths >= snapshot.quiz.passingScore * 100,
  };
}

/** round(earned * 100 / total, 2) * 100, half up, in exact integers. */
function percentHundredths(earned: number, total: number) {
  if (total <= 0) return 0;
  // floor(earned * 10000 / total + 1/2) = floor((2 * earned * 10000 + total) / (2 * total))
  return Math.floor((2 * earned * 10_000 + total) / (2 * total));
}
