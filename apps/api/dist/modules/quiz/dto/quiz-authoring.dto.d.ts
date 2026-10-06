import { GradingPolicy, QuizScope, QuizStatus, ReviewPolicy } from '../entities/quiz.entity.js';
declare abstract class QuizSettingsDto {
    slug?: string | null;
    description?: string | null;
    passingScore?: number;
    maxAttempts?: number | null;
    durationMinutes?: number | null;
    isRequired?: boolean;
    reviewPolicy?: ReviewPolicy;
    gradingPolicy?: GradingPolicy;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
}
export declare class UpdateQuizDto extends QuizSettingsDto {
    title?: string;
}
export declare class CreateQuizDto extends QuizSettingsDto {
    title: string;
    scope: QuizScope;
    targetId?: string | null;
}
export declare class ListQuizzesQueryDto {
    page: number;
    limit: number;
    scope?: QuizScope;
    status?: QuizStatus;
    search?: string;
    courseId?: string;
}
export {};
