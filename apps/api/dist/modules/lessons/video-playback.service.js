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
import { ForbiddenException, Inject, Injectable, NotFoundException, } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CourseAccessService } from '../../courses/course-access.service.js';
import { MEDIA_STORAGE_DRIVER } from '../../storage/media-storage.constants.js';
import { Lesson, LessonType } from './entities/lesson.entity.js';
let VideoPlaybackService = class VideoPlaybackService {
    accessPolicy;
    dataSource;
    mediaStorage;
    constructor(accessPolicy, dataSource, mediaStorage) {
        this.accessPolicy = accessPolicy;
        this.dataSource = dataSource;
        this.mediaStorage = mediaStorage;
    }
    async createAccess(userId, lessonId) {
        const access = await this.accessPolicy.canAccessLesson(userId, lessonId);
        if (!access.granted) {
            if (access.reason === 'LESSON_NOT_FOUND')
                throw new NotFoundException('Lesson not found');
            throw new ForbiddenException('ENROLLMENT_REQUIRED');
        }
        const lesson = await this.dataSource.getRepository(Lesson).findOne({
            where: { id: lessonId, type: LessonType.VIDEO },
            select: {
                id: true,
                videoAssetId: true,
                videoExternalUrl: true,
                videoMimeType: true,
                videoFileSize: true,
            },
        });
        if (!lesson)
            throw new NotFoundException('Video lesson not found');
        if (lesson.videoExternalUrl)
            return { url: lesson.videoExternalUrl, expiresInSeconds: null };
        if (!lesson.videoAssetId)
            throw new NotFoundException('Video media not found');
        const expiresInSeconds = this.accessTtl();
        return {
            url: await this.mediaStorage.getSignedUrl(lesson.videoAssetId, expiresInSeconds),
            expiresInSeconds,
        };
    }
    async storedVideo(filePath) {
        const lesson = await this.dataSource.getRepository(Lesson).findOne({
            where: { videoAssetId: filePath, type: LessonType.VIDEO },
            select: { id: true, videoFileSize: true, videoMimeType: true },
        });
        if (!lesson?.videoFileSize || !lesson.videoMimeType)
            throw new NotFoundException('Video media not found');
        return {
            size: Number(lesson.videoFileSize),
            contentType: lesson.videoMimeType,
        };
    }
    getStream(filePath, range) {
        return this.mediaStorage.getStream(filePath, range);
    }
    accessTtl() {
        const seconds = Number(process.env.MEDIA_URL_TTL_SECONDS ?? 3600);
        if (!Number.isInteger(seconds) || seconds < 3600 || seconds > 7200)
            throw new Error('MEDIA_URL_TTL_SECONDS must be between 3600 and 7200');
        return seconds;
    }
};
VideoPlaybackService = __decorate([
    Injectable(),
    __param(2, Inject(MEDIA_STORAGE_DRIVER)),
    __metadata("design:paramtypes", [CourseAccessService,
        DataSource, Object])
], VideoPlaybackService);
export { VideoPlaybackService };
//# sourceMappingURL=video-playback.service.js.map