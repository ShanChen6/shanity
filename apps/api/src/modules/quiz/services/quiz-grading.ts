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
  score: number;
  isPassed: boolean;
};

/**
 * Exact, all-or-nothing grading from the frozen snapshot only: a question
 * scores when the selected set equals the correct set; unanswered earns zero.
 * `score` is the whole-number percentage, rounded half up.
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
  const score =
    totalPoints > 0 ? Math.floor((earnedPoints * 100) / totalPoints + 0.5) : 0;
  return {
    answers,
    earnedPoints,
    totalPoints,
    score,
    isPassed: score >= snapshot.quiz.passingScore,
  };
}
