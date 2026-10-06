var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, Injectable } from '@nestjs/common';
import { ReviewPolicy } from '../entities/quiz.entity.js';
import { QuizQuestionEntity } from '../entities/quiz-question.entity.js';
import { validateQuizStructure } from './quiz-structure.js';
import { QuizTargetValidationService } from './quiz-target-validation.service.js';
let QuizPublishValidationPipeline = class QuizPublishValidationPipeline {
    targets;
    constructor(targets) {
        this.targets = targets;
    }
    async validate(quiz, manager) {
        const issues = [];
        try {
            await this.targets.validate(quiz.scope, quiz.targetId, manager);
        }
        catch (error) {
            if (!(error instanceof BadRequestException))
                throw error;
            const { code } = error.getResponse();
            issues.push({ code });
        }
        const questions = await manager.getRepository(QuizQuestionEntity).find({
            where: { quizId: quiz.id },
            relations: { options: true },
            select: {
                id: true,
                type: true,
                points: true,
                position: true,
                options: { id: true, isCorrect: true },
            },
            order: { position: 'ASC', id: 'ASC' },
        });
        issues.push(...validateQuizStructure(questions).issues);
        if (!Number.isInteger(quiz.passingScore) ||
            quiz.passingScore < 1 ||
            quiz.passingScore > 100)
            issues.push({ code: 'INVALID_PASSING_SCORE' });
        if (!isPositiveIntegerOrNull(quiz.maxAttempts))
            issues.push({ code: 'INVALID_MAX_ATTEMPTS' });
        if (!isPositiveIntegerOrNull(quiz.durationMinutes))
            issues.push({ code: 'INVALID_DURATION_MINUTES' });
        if (quiz.reviewPolicy === ReviewPolicy.AFTER_EXHAUSTED &&
            quiz.maxAttempts === null)
            issues.push({ code: 'REVIEW_POLICY_REQUIRES_MAX_ATTEMPTS' });
        return issues;
    }
};
QuizPublishValidationPipeline = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [QuizTargetValidationService])
], QuizPublishValidationPipeline);
export { QuizPublishValidationPipeline };
const isPositiveIntegerOrNull = (value) => value === null || (Number.isInteger(value) && value >= 1);
//# sourceMappingURL=quiz-publish-validation.pipeline.js.map