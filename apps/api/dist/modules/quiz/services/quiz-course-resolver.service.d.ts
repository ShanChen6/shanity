import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { QuizScope } from '../entities/quiz.entity.js';
import type { QuizEntity } from '../entities/quiz.entity.js';
export type QuizTarget = Pick<QuizEntity, 'scope' | 'targetId'>;
export declare class QuizTargetNotFoundError extends Error {
    readonly scope: QuizScope;
    readonly targetId: string | null;
    constructor(scope: QuizScope, targetId: string | null);
}
export declare class QuizCourseResolverService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    resolveCourseIdByQuiz(quiz: QuizTarget, manager?: EntityManager): Promise<string | null>;
    findTargetCourseId({ scope, targetId }: QuizTarget, manager?: EntityManager): Promise<string | null>;
}
