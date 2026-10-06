import type { EntityManager } from 'typeorm';
import { QuizEntity } from '../entities/quiz.entity.js';
import { QuizTargetValidationService } from './quiz-target-validation.service.js';
export type QuizPublishIssue = {
    code: string;
    questionId?: string;
};
export declare class QuizPublishValidationPipeline {
    private readonly targets;
    constructor(targets: QuizTargetValidationService);
    validate(quiz: QuizEntity, manager: EntityManager): Promise<QuizPublishIssue[]>;
}
