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
import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors, } from '@nestjs/common';
import { CurriculumChangedInterceptor } from '../curriculum/curriculum-changed.interceptor.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { OriginGuard, Roles, SessionGuard } from '../../auth/auth.guards.js';
import { CreateLessonDto, DocumentSettingsDto, DocumentUploadDto, ReorderLessonsDto, UpdateLessonDto, VideoUploadDto, } from './dto/lessons.dto.js';
import { LessonOwnershipGuard } from './lesson-ownership.guard.js';
import { LessonRequestSanitizationInterceptor } from './lesson-request-sanitization.interceptor.js';
import { LessonsService } from './lessons.service.js';
import { maxVideoBytes } from '../../storage/media-storage.constants.js';
import { MEDIA_LIMITS } from '../../storage/media-storage.constants.js';
const uuid = () => new ParseUUIDPipe({ version: '4' });
let LessonsController = class LessonsController {
    lessons;
    constructor(lessons) {
        this.lessons = lessons;
    }
    create(chapterId, dto) {
        return this.lessons.create(chapterId, dto);
    }
    uploadVideo(chapterId, dto, file) {
        return this.lessons.createUploadedVideo(chapterId, dto, file);
    }
    uploadDocument(chapterId, dto, file) {
        return this.lessons.createUploadedDocument(chapterId, dto, file);
    }
    list(chapterId) {
        return this.lessons.list(chapterId);
    }
    reorder(chapterId, dto) {
        return this.lessons.reorder(chapterId, dto);
    }
    update(id, dto) {
        return this.lessons.update(id, dto);
    }
    replaceVideo(id, dto, file) {
        return this.lessons.replaceUploadedVideo(id, dto, file);
    }
    replaceDocument(id, dto, file) {
        return this.lessons.replaceUploadedDocument(id, dto, file);
    }
    updateDocumentSettings(id, dto) {
        return this.lessons.updateDocumentSettings(id, dto);
    }
    remove(id) {
        return this.lessons.remove(id);
    }
};
__decorate([
    Post('chapters/:chapterId/lessons'),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('chapterId', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, CreateLessonDto]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "create", null);
__decorate([
    Post('chapters/:chapterId/lessons/video-upload'),
    UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxVideoBytes() } })),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('chapterId', uuid())),
    __param(1, Body()),
    __param(2, UploadedFile()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, VideoUploadDto, Object]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "uploadVideo", null);
__decorate([
    Post('chapters/:chapterId/lessons/document-upload'),
    UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_LIMITS.document } })),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('chapterId', uuid())),
    __param(1, Body()),
    __param(2, UploadedFile()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, DocumentUploadDto, Object]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "uploadDocument", null);
__decorate([
    Get('chapters/:chapterId/lessons'),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('chapterId', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "list", null);
__decorate([
    Patch('chapters/:chapterId/lessons/reorder'),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('chapterId', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ReorderLessonsDto]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "reorder", null);
__decorate([
    Patch('lessons/:id'),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateLessonDto]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "update", null);
__decorate([
    Post('lessons/:id/video-upload'),
    HttpCode(200),
    UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxVideoBytes() } })),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id', uuid())),
    __param(1, Body()),
    __param(2, UploadedFile()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, VideoUploadDto, Object]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "replaceVideo", null);
__decorate([
    Post('lessons/:id/document-upload'),
    HttpCode(200),
    UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_LIMITS.document } })),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id', uuid())),
    __param(1, Body()),
    __param(2, UploadedFile()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, DocumentUploadDto, Object]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "replaceDocument", null);
__decorate([
    Patch('lessons/:id/document-settings'),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, DocumentSettingsDto]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "updateDocumentSettings", null);
__decorate([
    Delete('lessons/:id'),
    Header('Cache-Control', 'no-store'),
    HttpCode(204),
    __param(0, Param('id', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "remove", null);
LessonsController = __decorate([
    Controller(),
    UseGuards(OriginGuard, SessionGuard, LessonOwnershipGuard),
    UseInterceptors(LessonRequestSanitizationInterceptor, CurriculumChangedInterceptor),
    Roles('instructor', 'admin'),
    __metadata("design:paramtypes", [LessonsService])
], LessonsController);
export { LessonsController };
//# sourceMappingURL=lessons.controller.js.map