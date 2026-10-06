var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Body, ClassSerializerInterceptor, Controller, Delete, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards, UseInterceptors, } from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../../../auth/auth.guards.js';
import { CreateOptionDto, CreateQuestionDto, ReorderOptionsDto, ReorderQuestionsDto, UpdateOptionDto, UpdateQuestionDto, } from '../dto/quiz-question-authoring.dto.js';
import { QuizAuthorizationGuard } from '../guards/quiz-authorization.guard.js';
import { QuizQuestionAuthoringService } from '../services/quiz-question-authoring.service.js';
const uuid = () => new ParseUUIDPipe();
let QuizQuestionAuthoringController = class QuizQuestionAuthoringController {
    authoring;
    constructor(authoring) {
        this.authoring = authoring;
    }
    createQuestion(quizId, body) {
        return this.authoring.createQuestion(quizId, body);
    }
    reorderQuestions(quizId, body) {
        return this.authoring.reorderQuestions(quizId, body);
    }
    updateQuestion(quizId, questionId, body) {
        return this.authoring.updateQuestion(quizId, questionId, body);
    }
    deleteQuestion(quizId, questionId) {
        return this.authoring.deleteQuestion(quizId, questionId);
    }
    createOption(questionId, body) {
        return this.authoring.createOption(questionId, body);
    }
    reorderOptions(questionId, body) {
        return this.authoring.reorderOptions(questionId, body);
    }
    updateOption(optionId, body) {
        return this.authoring.updateOption(optionId, body);
    }
    deleteOption(optionId) {
        return this.authoring.deleteOption(optionId);
    }
};
__decorate([
    Post('quizzes/:quizId/questions'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('quizId', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, CreateQuestionDto]),
    __metadata("design:returntype", void 0)
], QuizQuestionAuthoringController.prototype, "createQuestion", null);
__decorate([
    Patch('quizzes/:quizId/questions/reorder'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('quizId', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ReorderQuestionsDto]),
    __metadata("design:returntype", void 0)
], QuizQuestionAuthoringController.prototype, "reorderQuestions", null);
__decorate([
    Put('quizzes/:quizId/questions/:questionId'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('quizId', uuid())),
    __param(1, Param('questionId', uuid())),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, UpdateQuestionDto]),
    __metadata("design:returntype", void 0)
], QuizQuestionAuthoringController.prototype, "updateQuestion", null);
__decorate([
    Delete('quizzes/:quizId/questions/:questionId'),
    HttpCode(200),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('quizId', uuid())),
    __param(1, Param('questionId', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], QuizQuestionAuthoringController.prototype, "deleteQuestion", null);
__decorate([
    Post('questions/:questionId/options'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('questionId', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, CreateOptionDto]),
    __metadata("design:returntype", void 0)
], QuizQuestionAuthoringController.prototype, "createOption", null);
__decorate([
    Patch('questions/:questionId/options/reorder'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('questionId', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ReorderOptionsDto]),
    __metadata("design:returntype", void 0)
], QuizQuestionAuthoringController.prototype, "reorderOptions", null);
__decorate([
    Put('options/:optionId'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('optionId', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateOptionDto]),
    __metadata("design:returntype", void 0)
], QuizQuestionAuthoringController.prototype, "updateOption", null);
__decorate([
    Delete('options/:optionId'),
    HttpCode(200),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('optionId', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], QuizQuestionAuthoringController.prototype, "deleteOption", null);
QuizQuestionAuthoringController = __decorate([
    Controller('admin'),
    UseGuards(OriginGuard, SessionGuard, QuizAuthorizationGuard),
    Roles('instructor', 'admin'),
    UseInterceptors(ClassSerializerInterceptor),
    __metadata("design:paramtypes", [QuizQuestionAuthoringService])
], QuizQuestionAuthoringController);
export { QuizQuestionAuthoringController };
//# sourceMappingURL=quiz-question-authoring.controller.js.map