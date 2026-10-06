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
import { ClassSerializerInterceptor, Controller, Get, Header, Param, ParseUUIDPipe, Req, UseGuards, UseInterceptors, } from '@nestjs/common';
import { Roles, SessionGuard, } from '../../../auth/auth.guards.js';
import { QuizAuthorizationGuard, } from '../guards/quiz-authorization.guard.js';
import { QuizQuestionsService } from '../services/quiz-questions.service.js';
let QuizTakeController = class QuizTakeController {
    questions;
    constructor(questions) {
        this.questions = questions;
    }
    take(req, id) {
        return this.questions.getForLearner(req.principal, id);
    }
};
__decorate([
    Get(':id/take'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], QuizTakeController.prototype, "take", null);
QuizTakeController = __decorate([
    Controller('quizzes'),
    UseGuards(SessionGuard),
    UseInterceptors(ClassSerializerInterceptor),
    __metadata("design:paramtypes", [QuizQuestionsService])
], QuizTakeController);
export { QuizTakeController };
let AdminQuizQuestionsController = class AdminQuizQuestionsController {
    questions;
    constructor(questions) {
        this.questions = questions;
    }
    list(req) {
        return this.questions.listForInstructor(req.quiz.id);
    }
};
__decorate([
    Get('questions'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminQuizQuestionsController.prototype, "list", null);
AdminQuizQuestionsController = __decorate([
    Controller('admin/quizzes/:id'),
    UseGuards(SessionGuard, QuizAuthorizationGuard),
    Roles('instructor', 'admin'),
    UseInterceptors(ClassSerializerInterceptor),
    __metadata("design:paramtypes", [QuizQuestionsService])
], AdminQuizQuestionsController);
export { AdminQuizQuestionsController };
//# sourceMappingURL=quiz-questions.controller.js.map