import { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import type { QuizAttemptSnapshot } from '../services/quiz-attempt-snapshot.js';
import { LearnerQuestionResponseDto } from './quiz-question-response.dto.js';
export declare class SaveAttemptAnswerDto {
    questionId: string;
    selectedOptionId?: string;
    selectedOptionIds?: string[];
}
export type SavedAnswerRow = {
    questionId: string;
    selectedOptionIds: string[];
    savedAt: Date;
};
export declare class LearnerAttemptAnswerResponseDto {
    questionId: string;
    selectedOptionId: string | null;
    selectedOptionIds: string[];
    savedAt: Date;
    static from(answer: SavedAnswerRow): LearnerAttemptAnswerResponseDto;
}
export type AttemptSource = {
    id: string;
    quizId: string;
    attemptNumber: number;
    status: QuizAttemptStatus;
    quizSnapshot: QuizAttemptSnapshot;
    startedAt: Date;
    expiresAt: Date | null;
    submittedAt: Date | null;
    score: number | null;
    isPassed: boolean | null;
    earnedPoints: number | null;
    totalPoints: number | null;
    percentage: number | null;
    serverNow: Date;
};
export declare class LearnerAttemptResponseDto {
    id: string;
    quizId: string;
    attemptNumber: number;
    status: QuizAttemptStatus;
    startedAt: Date;
    expiresAt: Date | null;
    submittedAt: Date | null;
    score: number | null;
    isPassed: boolean | null;
    earnedPoints: number | null;
    totalPoints: number | null;
    percentage: number | null;
    notice?: 'ATTEMPT_TIMED_OUT';
    serverNow: Date;
    quiz?: {
        title: string;
        description: string | null;
        durationMinutes: number | null;
        passingScore: number;
        questions: LearnerQuestionResponseDto[];
    };
    answers?: LearnerAttemptAnswerResponseDto[];
    static from(attempt: AttemptSource, answers: SavedAnswerRow[] | null): LearnerAttemptResponseDto;
}
