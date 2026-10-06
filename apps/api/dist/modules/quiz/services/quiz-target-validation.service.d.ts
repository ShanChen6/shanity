import type { EntityManager } from 'typeorm';
import { QuizScope } from '../entities/quiz.entity.js';
import { QuizCourseResolverService } from './quiz-course-resolver.service.js';
export declare const QuizTargetErrorCode: {
    readonly INVALID_QUIZ_SCOPE: "INVALID_QUIZ_SCOPE";
    readonly INVALID_TARGET_LESSON: "INVALID_TARGET_LESSON";
    readonly INVALID_TARGET_CHAPTER: "INVALID_TARGET_CHAPTER";
    readonly INVALID_TARGET_COURSE: "INVALID_TARGET_COURSE";
    readonly STANDALONE_QUIZ_CANNOT_HAVE_TARGET: "STANDALONE_QUIZ_CANNOT_HAVE_TARGET";
    readonly INVALID_QUIZ_TARGET: "INVALID_QUIZ_TARGET";
};
export type QuizTargetErrorCode = (typeof QuizTargetErrorCode)[keyof typeof QuizTargetErrorCode];
export type ValidatedQuizTarget = {
    scope: QuizScope;
    targetId: string | null;
    courseId: string | null;
};
export declare class QuizTargetValidationService {
    private readonly resolver;
    constructor(resolver: QuizCourseResolverService);
    validate(scope: unknown, targetId: unknown, manager?: EntityManager): Promise<ValidatedQuizTarget>;
}
export declare function rethrowQuizTargetViolation(error: unknown): never;
