import type { QuizAttemptSnapshot } from './quiz-attempt-snapshot.js';
export type SavedAnswer = {
    questionId: string;
    selectedOptionIds: string[];
};
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
export declare function gradeAttempt(snapshot: QuizAttemptSnapshot, saved: SavedAnswer[]): AttemptGrade;
