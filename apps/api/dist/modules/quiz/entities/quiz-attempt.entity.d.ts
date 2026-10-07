import type { Relation } from 'typeorm';
import { User } from '../../../users/user.entity.js';
import { QuizEntity } from './quiz.entity.js';
import { AttemptAnswerEntity } from './attempt-answer.entity.js';
import type { QuizAttemptSnapshot } from '../services/quiz-attempt-snapshot.js';
export declare enum QuizAttemptStatus {
    IN_PROGRESS = "IN_PROGRESS",
    SUBMITTING = "SUBMITTING",
    SUBMITTED = "SUBMITTED",
    TIMED_OUT = "TIMED_OUT",
    ABANDONED = "ABANDONED"
}
export declare class QuizAttemptEntity {
    id: string;
    userId: string;
    user: Relation<User>;
    quizId: string;
    quiz: Relation<QuizEntity>;
    quizVersion: number;
    attemptNumber: number;
    quizSnapshot: QuizAttemptSnapshot;
    status: QuizAttemptStatus;
    startedAt: Date;
    expiresAt: Date | null;
    submittedAt: Date | null;
    score: number | null;
    earnedPoints: number | null;
    totalPoints: number | null;
    percentage: string | null;
    isPassed: boolean | null;
    answers: Relation<AttemptAnswerEntity[]>;
    createdAt: Date;
    updatedAt: Date;
}
