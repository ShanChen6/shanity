import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { CourseAccessService } from '../../../courses/course-access.service.js';
import { QuizEntity } from '../entities/quiz.entity.js';
import { QuizAuthorizationGuard } from '../guards/quiz-authorization.guard.js';
import { QuizCourseResolverService } from './quiz-course-resolver.service.js';
export declare const QUIZ_NOT_FOUND: {
    statusCode: number;
    message: string;
    code: string;
};
export declare const quizForbidden: (code: string, extra?: object) => ForbiddenException;
export declare const QUIZ_FORBIDDEN = "QUIZ_FORBIDDEN";
export declare const TARGET_COURSE_FORBIDDEN = "TARGET_COURSE_FORBIDDEN";
export declare class QuizLearnerAccessService {
    private readonly dataSource;
    private readonly resolver;
    private readonly authorization;
    private readonly courseAccess;
    constructor(dataSource: DataSource, resolver: QuizCourseResolverService, authorization: QuizAuthorizationGuard, courseAccess: CourseAccessService);
    loadQuiz(quizId: string, manager?: EntityManager): Promise<QuizEntity>;
    loadPublishedQuiz(quizId: string, manager?: EntityManager, lock?: boolean): Promise<QuizEntity>;
    assertCanTake(principal: Principal, quiz: Pick<QuizEntity, 'id' | 'scope' | 'targetId' | 'status' | 'createdBy'>): Promise<void>;
}
