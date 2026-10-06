var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException, } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { QuizEntity, QuizStatus } from '../entities/quiz.entity.js';
import { QUIZ_NOT_FOUND } from './quiz-learner-access.service.js';
import { QuizPublishValidationPipeline, } from './quiz-publish-validation.pipeline.js';
const conflict = (code) => new ConflictException({ statusCode: 409, message: code, code });
let QuizPublishingService = class QuizPublishingService {
    dataSource;
    pipeline;
    curriculum;
    constructor(dataSource, pipeline, curriculum) {
        this.dataSource = dataSource;
        this.pipeline = pipeline;
        this.curriculum = curriculum;
    }
    async publish(quizId, courseId) {
        const result = await this.dataSource.transaction(async (manager) => {
            const quiz = await manager.getRepository(QuizEntity).findOne({
                where: { id: quizId },
                lock: { mode: 'pessimistic_write' },
            });
            if (!quiz)
                throw new NotFoundException(QUIZ_NOT_FOUND);
            if (quiz.status === QuizStatus.PUBLISHED)
                throw conflict('QUIZ_ALREADY_PUBLISHED');
            if (quiz.status !== QuizStatus.DRAFT)
                throw conflict('QUIZ_NOT_DRAFT');
            const issues = await this.pipeline.validate(quiz, manager);
            if (issues.length)
                return { issues };
            await manager.getRepository(QuizEntity).update(quizId, {
                status: QuizStatus.PUBLISHED,
                publishedAt: () => 'now()',
                updatedAt: () => 'now()',
            });
            return {
                published: await manager
                    .getRepository(QuizEntity)
                    .findOneByOrFail({ id: quizId }),
            };
        });
        if ('issues' in result)
            throw new UnprocessableEntityException({
                statusCode: 422,
                message: 'QUIZ_NOT_PUBLISHABLE',
                code: 'QUIZ_NOT_PUBLISHABLE',
                issues: result.issues,
            });
        if (courseId)
            this.curriculum.emitChanged({
                courseId,
                source: 'POST /admin/quizzes/:id/publish',
            });
        const { id, title, version, status, publishedAt } = result.published;
        return { id, title, version, status, publishedAt };
    }
};
QuizPublishingService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        QuizPublishValidationPipeline,
        CurriculumEvents])
], QuizPublishingService);
export { QuizPublishingService };
//# sourceMappingURL=quiz-publishing.service.js.map