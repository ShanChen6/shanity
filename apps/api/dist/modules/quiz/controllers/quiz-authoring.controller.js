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
import { Body, ClassSerializerInterceptor, Controller, Delete, Get, Header, HttpCode, Post, Put, Query, Req, UseGuards, UseInterceptors, } from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard, } from '../../../auth/auth.guards.js';
import { CreateQuizDto, ListQuizzesQueryDto, UpdateQuizDto, } from '../dto/quiz-authoring.dto.js';
import { QuizAuthorizationGuard, } from '../guards/quiz-authorization.guard.js';
import { QuizAuthoringService } from '../services/quiz-authoring.service.js';
import { QuizPublishingService } from '../services/quiz-publishing.service.js';
let QuizAuthoringController = class QuizAuthoringController {
    authoring;
    publishing;
    constructor(authoring, publishing) {
        this.authoring = authoring;
        this.publishing = publishing;
    }
    create(req, body) {
        return this.authoring.create(req.principal, body);
    }
    list(req, query) {
        return this.authoring.list(req.principal, query);
    }
    detail(req) {
        return this.authoring.detail(req.quiz.id, req.quiz.courseId);
    }
    update(req, body) {
        return this.authoring.update(req.quiz.id, req.quiz.courseId, body);
    }
    publish(req) {
        return this.publishing.publish(req.quiz.id, req.quiz.courseId);
    }
    remove(req) {
        return this.authoring.remove(req.quiz.id, req.quiz.courseId);
    }
};
__decorate([
    Post(),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateQuizDto]),
    __metadata("design:returntype", void 0)
], QuizAuthoringController.prototype, "create", null);
__decorate([
    Get(),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ListQuizzesQueryDto]),
    __metadata("design:returntype", void 0)
], QuizAuthoringController.prototype, "list", null);
__decorate([
    Get(':id'),
    UseGuards(QuizAuthorizationGuard),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QuizAuthoringController.prototype, "detail", null);
__decorate([
    Put(':id'),
    UseGuards(QuizAuthorizationGuard),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, UpdateQuizDto]),
    __metadata("design:returntype", void 0)
], QuizAuthoringController.prototype, "update", null);
__decorate([
    Post(':id/publish'),
    UseGuards(QuizAuthorizationGuard),
    HttpCode(200),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QuizAuthoringController.prototype, "publish", null);
__decorate([
    Delete(':id'),
    UseGuards(QuizAuthorizationGuard),
    HttpCode(200),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], QuizAuthoringController.prototype, "remove", null);
QuizAuthoringController = __decorate([
    Controller('admin/quizzes'),
    UseGuards(OriginGuard, SessionGuard),
    Roles('instructor', 'admin'),
    UseInterceptors(ClassSerializerInterceptor),
    __metadata("design:paramtypes", [QuizAuthoringService,
        QuizPublishingService])
], QuizAuthoringController);
export { QuizAuthoringController };
//# sourceMappingURL=quiz-authoring.controller.js.map