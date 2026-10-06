import type { Relation } from 'typeorm';
import { QuizAttemptEntity } from './quiz-attempt.entity.js';
export declare class AttemptAnswerEntity {
    id: string;
    attemptId: string;
    attempt: Relation<QuizAttemptEntity>;
    questionId: string;
    selectedOptionIds: string[];
    isCorrect: boolean | null;
    pointsEarned: number | null;
    savedAt: Date;
}
