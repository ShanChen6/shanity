import { CanActivate, ExecutionContext } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthRequest } from '../../../auth/auth.guards.js';
import type { Principal } from '../../../auth/auth.service.js';
import { QuizEntity } from '../entities/quiz.entity.js';
import { QuizCourseResolverService } from '../services/quiz-course-resolver.service.js';
export declare const QUIZ_FORBIDDEN: {
    statusCode: number;
    message: string;
    code: string;
};
export type AuthorizedQuiz = Pick<QuizEntity, 'id' | 'scope' | 'targetId' | 'status' | 'createdBy'> & {
    courseId: string | null;
};
export type QuizAuthorizationRequest = AuthRequest & {
    quiz?: AuthorizedQuiz;
};
export declare class QuizAuthorizationGuard implements CanActivate {
    private readonly dataSource;
    private readonly resolver;
    constructor(dataSource: DataSource, resolver: QuizCourseResolverService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    authorize(principal: Pick<Principal, 'id' | 'roles'>, quiz: Omit<AuthorizedQuiz, 'courseId'>): Promise<AuthorizedQuiz | null>;
    private teachesCourse;
}
