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
import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req, UseGuards, } from '@nestjs/common';
import { SessionGuard } from '../../../auth/auth.guards.js';
import { CourseEnrollmentGuard } from '../../../courses/course-enrollment.guard.js';
import { ListMyAttemptsQueryDto, ListStandaloneQuizzesQueryDto, } from '../dto/student-quiz.dto.js';
import { QuizStudentReadService } from '../services/quiz-student-read.service.js';
let QuizStudentReadController = class QuizStudentReadController {
    reads;
    constructor(reads) {
        this.reads = reads;
    }
    listStandalone(query) {
        return this.reads.listStandalone(query);
    }
    standalone(req, slug) {
        return this.reads.standaloneBySlug(req.principal, slug);
    }
    listForCourse(req, courseId) {
        return this.reads.listForCourse(req.principal, courseId);
    }
    myAttempts(req, query) {
        return this.reads.myAttempts(req.principal, query);
    }
};
__decorate([
    Get('quizzes/standalone'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ListStandaloneQuizzesQueryDto]),
    __metadata("design:returntype", void 0)
], QuizStudentReadController.prototype, "listStandalone", null);
__decorate([
    Get('quizzes/standalone/:slug'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], QuizStudentReadController.prototype, "standalone", null);
__decorate([
    Get('courses/:courseId/quizzes'),
    UseGuards(CourseEnrollmentGuard),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('courseId', new ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], QuizStudentReadController.prototype, "listForCourse", null);
__decorate([
    Get('my-quiz-attempts'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ListMyAttemptsQueryDto]),
    __metadata("design:returntype", void 0)
], QuizStudentReadController.prototype, "myAttempts", null);
QuizStudentReadController = __decorate([
    Controller(),
    UseGuards(SessionGuard),
    __metadata("design:paramtypes", [QuizStudentReadService])
], QuizStudentReadController);
export { QuizStudentReadController };
//# sourceMappingURL=quiz-student-read.controller.js.map