var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Lesson, LessonType } from './entities/lesson.entity.js';
let LessonAccessService = class LessonAccessService {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async getAccessible(lessonId) {
        const lesson = await this.dataSource.getRepository(Lesson).findOne({
            where: { id: lessonId },
            select: {
                id: true,
                chapterId: true,
                title: true,
                slug: true,
                type: true,
                position: true,
                isPreview: true,
                isPublished: true,
                textBody: true,
                videoExternalUrl: true,
                videoProvider: true,
                videoDurationSeconds: true,
                documentFileName: true,
                documentFileSize: true,
                documentMimeType: true,
                documentFileType: true,
                documentDownloadAllowed: true,
            },
        });
        if (!lesson)
            throw new NotFoundException('Lesson not found');
        return {
            id: lesson.id,
            chapterId: lesson.chapterId,
            title: lesson.title,
            slug: lesson.slug,
            type: lesson.type,
            position: lesson.position,
            isPreview: lesson.isPreview,
            isPublished: lesson.isPublished,
            ...(lesson.type === LessonType.TEXT ? { content: lesson.textBody } : {}),
            ...(lesson.type === LessonType.VIDEO
                ? {
                    videoProvider: lesson.videoProvider,
                    videoExternalUrl: lesson.videoExternalUrl,
                    durationSeconds: lesson.videoDurationSeconds,
                }
                : {}),
            ...(lesson.type === LessonType.DOCUMENT
                ? {
                    fileName: lesson.documentFileName,
                    fileSize: lesson.documentFileSize,
                    fileType: lesson.documentFileType,
                    mimeType: lesson.documentMimeType,
                    allowDownload: lesson.documentDownloadAllowed,
                }
                : {}),
        };
    }
};
LessonAccessService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource])
], LessonAccessService);
export { LessonAccessService };
//# sourceMappingURL=lesson-access.service.js.map