import { randomInt } from 'node:crypto';
import type {
  GradingPolicy,
  QuizEntity,
  QuizScope,
  ReviewPolicy,
} from '../entities/quiz.entity.js';
import type {
  QuizQuestionEntity,
  QuizQuestionType,
} from '../entities/quiz-question.entity.js';

export const QUIZ_SNAPSHOT_SCHEMA_VERSION = 1;

export type SnapshotOption = {
  id: string;
  content: string;
  position: number;
  isCorrect: boolean;
};

export type SnapshotQuestion = {
  id: string;
  type: QuizQuestionType;
  content: string;
  position: number;
  points: number;
  explanation: string | null;
  // Display order for this attempt.
  options: SnapshotOption[];
};

/**
 * Everything an attempt needs to be rendered, resumed and graded without
 * reading authoring rows again. Contains the answer key: server-side only.
 */
export type QuizAttemptSnapshot = {
  schemaVersion: typeof QUIZ_SNAPSHOT_SCHEMA_VERSION;
  quiz: {
    id: string;
    version: number;
    title: string;
    description: string | null;
    scope: QuizScope;
    targetId: string | null;
    courseId: string | null;
    passingScore: number;
    durationMinutes: number | null;
    maxAttempts: number | null;
    reviewPolicy: ReviewPolicy;
    gradingPolicy: GradingPolicy;
  };
  // Display order for this attempt, shuffled once at start when enabled.
  questions: SnapshotQuestion[];
};

export type ShuffleFn = <T>(items: readonly T[]) => T[];

/** Fisher-Yates with a CSPRNG so the order cannot be predicted client-side. */
export const secureShuffle: ShuffleFn = (items) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};

const byPosition = (
  a: { position: number; id: string },
  b: { position: number; id: string },
) => a.position - b.position || a.id.localeCompare(b.id);

export function buildQuizSnapshot(
  quiz: QuizEntity,
  courseId: string | null,
  questions: QuizQuestionEntity[],
  shuffle: ShuffleFn = secureShuffle,
): QuizAttemptSnapshot {
  const ordered = [...questions]
    .sort(byPosition)
    .map((question): SnapshotQuestion => {
      const options = [...(question.options ?? [])]
        .sort(byPosition)
        .map(({ id, content, position, isCorrect }) => ({
          id,
          content,
          position,
          isCorrect,
        }));
      return {
        id: question.id,
        type: question.type,
        content: question.content,
        position: question.position,
        points: question.points,
        explanation: question.explanation,
        options: quiz.shuffleOptions ? shuffle(options) : options,
      };
    });
  return {
    schemaVersion: QUIZ_SNAPSHOT_SCHEMA_VERSION,
    quiz: {
      id: quiz.id,
      version: quiz.version,
      title: quiz.title,
      description: quiz.description,
      scope: quiz.scope,
      targetId: quiz.targetId,
      courseId,
      passingScore: quiz.passingScore,
      durationMinutes: quiz.durationMinutes,
      maxAttempts: quiz.maxAttempts,
      reviewPolicy: quiz.reviewPolicy,
      gradingPolicy: quiz.gradingPolicy,
    },
    questions: quiz.shuffleQuestions ? shuffle(ordered) : ordered,
  };
}
