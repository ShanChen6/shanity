import type { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import type { QuizQuestionType } from '../entities/quiz-question.entity.js';
import type { AttemptSource } from './quiz-attempt.dto.js';
export declare class ResultOptionDto {
    id: string;
    content: string;
    isCorrect?: boolean;
}
export declare class ResultQuestionDto {
    id: string;
    type: QuizQuestionType;
    content: string;
    points: number;
    selectedOptionId: string | null;
    selectedOptionIds: string[];
    isCorrect: boolean | null;
    pointsEarned: number | null;
    explanation: string | null;
    options: ResultOptionDto[];
}
export declare class AttemptResultDto {
    attemptId: string;
    quizId: string;
    quizTitle: string;
    status: QuizAttemptStatus;
    notice?: 'ATTEMPT_TIMED_OUT';
    score: {
        earnedPoints: number;
        totalPoints: number;
        percentage: number;
        passingScore: number;
        passed: boolean;
    };
    attemptInfo: {
        currentAttempt: number;
        maxAttempts: number | null;
        startedAt: Date;
        submittedAt: Date | null;
    };
    reviewPolicy: string;
    reviewAllowed: boolean;
    questions: ResultQuestionDto[];
}
type AnswerSource = {
    questionId: string;
    selectedOptionIds: string[];
    isCorrect: boolean | null;
    pointsEarned: number | null;
};
export declare function buildAttemptResult(attempt: AttemptSource, answers: AnswerSource[], reviewAllowed: boolean): AttemptResultDto;
export {};
