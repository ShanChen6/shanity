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
import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, } from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard, } from '../../auth/auth.guards.js';
import { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import { UpdateProgressDto } from './dto/update-progress.dto.js';
import { ProgressService } from './progress.service.js';
import { LessonAccessGuard } from '../lessons/guards/lesson-access.guard.js';
import { CourseProgressCalculatorService } from './services/course-progress-calculator.service.js';
import { ResumeLearningService } from './services/resume-learning.service.js';
let ProgressController = class ProgressController {
    progress;
    progressCalculator;
    resumeLearning;
    constructor(progress, progressCalculator, resumeLearning) {
        this.progress = progress;
        this.progressCalculator = progressCalculator;
        this.resumeLearning = resumeLearning;
    }
    resumeCourse(req) {
        return this.resumeLearning.latest(req.principal.id);
    }
    resumeLesson(req, courseId) {
        return this.resumeLearning.course(req.principal.id, courseId);
    }
    enrolledCourses(req) {
        return this.progressCalculator.enrolledCourses(req.principal.id);
    }
    course(req, courseId) {
        return this.progress.courseProgress(req.principal.id, courseId);
    }
    start(req, lessonId) {
        return this.progress.startLesson(req.principal.id, lessonId);
    }
    heartbeat(req, lessonId, dto) {
        return this.progress.updateHeartbeat(req.principal.id, lessonId, dto);
    }
    complete(req, lessonId, dto) {
        return this.progress.completeLesson(req.principal.id, lessonId, dto);
    }
    video(req, id, dto) {
        return this.progress.videoProgress(req.principal.id, id, dto);
    }
};
__decorate([
    Get('student/resume-course'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "resumeCourse", null);
__decorate([
    Get('courses/:courseId/resume-lesson'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('courseId', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "resumeLesson", null);
__decorate([
    Get('student/enrolled-courses'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProgressController.prototype, "enrolledCourses", null);
__decorate([
    Get('courses/:courseId/progress'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('courseId', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "course", null);
__decorate([
    Post('lessons/:lessonId/progress/start'),
    UseGuards(LessonAccessGuard),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('lessonId', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "start", null);
__decorate([
    Patch('lessons/:lessonId/progress/heartbeat'),
    UseGuards(LessonAccessGuard),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('lessonId', new ParseUUIDPipe({ version: '4' }))),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, UpdateProgressDto]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "heartbeat", null);
__decorate([
    Post(['lessons/:lessonId/progress/complete', 'lessons/:lessonId/complete']),
    HttpCode(200),
    UseGuards(LessonAccessGuard),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('lessonId', new ParseUUIDPipe({ version: '4' }))),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, CompleteLessonDto]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "complete", null);
__decorate([
    Patch('lessons/:id/video-progress'),
    UseGuards(LessonAccessGuard),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe({ version: '4' }))),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, VideoProgressDto]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "video", null);
ProgressController = __decorate([
    Controller(),
    UseGuards(OriginGuard, SessionGuard),
    Roles('student'),
    __metadata("design:paramtypes", [ProgressService,
        CourseProgressCalculatorService,
        ResumeLearningService])
], ProgressController);
export { ProgressController };
//# sourceMappingURL=progress.controller.js.map