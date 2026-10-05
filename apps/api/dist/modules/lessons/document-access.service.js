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
import { MEDIA_STORAGE_DRIVER } from '../../storage/media-storage.constants.js';
import { LessonType } from './entities/lesson.entity.js';
let DocumentAccessService = class DocumentAccessService {
    dataSource;
    mediaStorage;
    constructor(dataSource, mediaStorage) {
        this.dataSource = dataSource;
        this.mediaStorage = mediaStorage;
    }
    async open(lessonId, behavior, bypass) {
        const document = await this.findDocument(lessonId);
        if (!document)
            throw new NotFoundException('Document lesson not found');
        if (behavior === 'download' && !document.allowDownload && !bypass)
            throw new ForbiddenException('DOWNLOAD_NOT_ALLOWED');
        if (!document.storageKey ||
            !document.fileName ||
            !document.fileSize ||
            !document.mimeType)
            throw new NotFoundException('Document media not found');
        return {
            stream: await this.mediaStorage.getStream(document.storageKey),
            fileName: document.fileName,
            fileSize: Number(document.fileSize),
            mimeType: document.mimeType,
        };
    }
    async findDocument(lessonId) {
        const [row] = await this.dataSource.query(`SELECT lesson.id,
          lesson.document_asset_id AS "storageKey",
          lesson.document_file_name AS "fileName",
          lesson.document_file_size AS "fileSize",
          lesson.document_mime_type AS "mimeType",
          lesson.document_download_allowed AS "allowDownload"
        FROM lessons lesson
        WHERE lesson.id = $1 AND lesson.type = $2`, [lessonId, LessonType.DOCUMENT]);
        return row;
    }
};
DocumentAccessService = __decorate([
    Injectable(),
    __param(1, Inject(MEDIA_STORAGE_DRIVER)),
    __metadata("design:paramtypes", [DataSource, Object])
], DocumentAccessService);
export { DocumentAccessService };
//# sourceMappingURL=document-access.service.js.map