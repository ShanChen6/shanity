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
import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards, } from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../../auth/auth.guards.js';
import { CompleteLessonDto, VideoProgressDto } from './progress.dto.js';
import { ProgressService } from './progress.service.js';
const uuid = () => new ParseUUIDPipe({ version: '4' });
let ProgressController = class ProgressController {
    progress;
    constructor(progress) {
        this.progress = progress;
    }
    courseProgress(req, courseId) {
        return this.progress.courseProgress(req.principal.id, courseId);
    }
    start(req, id) {
        return this.progress.start(req.principal.id, id);
    }
    complete(req, id, dto) {
        return this.progress.complete(req.principal.id, id, dto);
    }
    completeAlias(req, id, dto) {
        return this.progress.complete(req.principal.id, id, dto);
    }
    videoProgress(req, id, dto) {
        return this.progress.videoProgress(req.principal.id, id, dto);
    }
};
__decorate([
    Get('courses/:courseId/progress'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('courseId', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "courseProgress", null);
__decorate([
    Post('lessons/:id/progress/start'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "start", null);
__decorate([
    Post('lessons/:id/progress/complete'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', uuid())),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, CompleteLessonDto]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "complete", null);
__decorate([
    Post('lessons/:id/complete'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', uuid())),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, CompleteLessonDto]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "completeAlias", null);
__decorate([
    Patch('lessons/:id/video-progress'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', uuid())),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, VideoProgressDto]),
    __metadata("design:returntype", void 0)
], ProgressController.prototype, "videoProgress", null);
ProgressController = __decorate([
    Controller('api/v1'),
    UseGuards(OriginGuard, SessionGuard),
    Roles('student'),
    __metadata("design:paramtypes", [ProgressService])
], ProgressController);
export { ProgressController };
//# sourceMappingURL=progress.controller.js.map