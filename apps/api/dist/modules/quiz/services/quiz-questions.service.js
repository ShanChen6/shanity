var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InstructorQuestionResponseDto, LearnerQuizResponseDto, } from '../dto/quiz-question-response.dto.js';
import { QuizQuestionEntity } from '../entities/quiz-question.entity.js';
import { QuizLearnerAccessService } from './quiz-learner-access.service.js';
let QuizQuestionsService = class QuizQuestionsService {
    dataSource;
    access;
    constructor(dataSource, access) {
        this.dataSource = dataSource;
        this.access = access;
    }
    async listForInstructor(quizId) {
        const questions = await this.dataSource
            .getRepository(QuizQuestionEntity)
            .find({
            where: { quizId },
            relations: { options: true },
            order: {
                position: 'ASC',
                id: 'ASC',
                options: { position: 'ASC', id: 'ASC' },
            },
        });
        return questions.map((question) => InstructorQuestionResponseDto.from(question));
    }
    async getForLearner(principal, quizId) {
        const quiz = await this.access.loadPublishedQuiz(quizId);
        await this.access.assertCanTake(principal, quiz);
        const questions = await this.dataSource
            .getRepository(QuizQuestionEntity)
            .find({
            where: { quizId },
            relations: { options: true },
            select: {
                id: true,
                type: true,
                content: true,
                position: true,
                points: true,
                options: { id: true, content: true, position: true },
            },
            order: {
                position: 'ASC',
                id: 'ASC',
                options: { position: 'ASC', id: 'ASC' },
            },
        });
        return LearnerQuizResponseDto.from(quiz, questions);
    }
};
QuizQuestionsService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        QuizLearnerAccessService])
], QuizQuestionsService);
export { QuizQuestionsService };
//# sourceMappingURL=quiz-questions.service.js.map