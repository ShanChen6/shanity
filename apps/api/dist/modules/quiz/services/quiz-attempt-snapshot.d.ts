import type { GradingPolicy, QuizEntity, QuizScope, ReviewPolicy } from '../entities/quiz.entity.js';
import type { QuizQuestionEntity, QuizQuestionType } from '../entities/quiz-question.entity.js';
export declare const QUIZ_SNAPSHOT_SCHEMA_VERSION = 1;
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
    options: SnapshotOption[];
};
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
    questions: SnapshotQuestion[];
};
export type ShuffleFn = <T>(items: readonly T[]) => T[];
export declare const secureShuffle: ShuffleFn;
export declare function buildQuizSnapshot(quiz: QuizEntity, courseId: string | null, questions: QuizQuestionEntity[], shuffle?: ShuffleFn): QuizAttemptSnapshot;
