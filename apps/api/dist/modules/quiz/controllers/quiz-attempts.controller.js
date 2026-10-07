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
import { Body, ClassSerializerInterceptor, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, Res, UseGuards, UseInterceptors, } from '@nestjs/common';
import { OriginGuard, SessionGuard, } from '../../../auth/auth.guards.js';
import { SaveAttemptAnswerDto } from '../dto/quiz-attempt.dto.js';
import { QuizAttemptsService } from '../services/quiz-attempts.service.js';
let QuizAttemptsController = class QuizAttemptsController {
    attempts;
    constructor(attempts) {
        this.attempts = attempts;
    }
    async start(req, id, res) {
        const { created, attempt } = await this.attempts.start(req.principal, id);
        res.status(created ? 201 : 200);
        return attempt;
    }
    active(req, id) {
        return this.attempts.activeAttempt(req.principal, id);
    }
    saveAnswer(req, attemptId, body) {
        return this.attempts.saveAnswer(req.principal, attemptId, body);
    }
    result(req, attemptId) {
        return this.attempts.result(req.principal, attemptId);
    }
    submit(req, attemptId) {
        return this.attempts.submit(req.principal, attemptId);
    }
};
__decorate([
    Post('quizzes/:id/attempts'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe())),
    __param(2, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", Promise)
], QuizAttemptsController.prototype, "start", null);
__decorate([
    Get('quizzes/:id/active-attempt'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], QuizAttemptsController.prototype, "active", null);
__decorate([
    Put('quiz-attempts/:attemptId/answers'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('attemptId', new ParseUUIDPipe())),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, SaveAttemptAnswerDto]),
    __metadata("design:returntype", void 0)
], QuizAttemptsController.prototype, "saveAnswer", null);
__decorate([
    Get('quiz-attempts/:attemptId/result'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('attemptId', new ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], QuizAttemptsController.prototype, "result", null);
__decorate([
    Post('quiz-attempts/:attemptId/submit'),
    HttpCode(200),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('attemptId', new ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], QuizAttemptsController.prototype, "submit", null);
QuizAttemptsController = __decorate([
    Controller(),
    UseGuards(OriginGuard, SessionGuard),
    UseInterceptors(ClassSerializerInterceptor),
    __metadata("design:paramtypes", [QuizAttemptsService])
], QuizAttemptsController);
export { QuizAttemptsController };
//# sourceMappingURL=quiz-attempts.controller.js.map