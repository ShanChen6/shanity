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
var LessonsService_1;
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { DataSource } from 'typeorm';
import { Chapter } from '../../courses/chapter.entity.js';
import { sanitizeLessonHtml } from '../../security/html-sanitizer.js';
import { Lesson, DocumentFileType, LessonType, MediaProcessingStatus, VideoProvider, } from './entities/lesson.entity.js';
import { MEDIA_STORAGE_DRIVER } from '../../storage/media-storage.constants.js';
const EMPTY_CONTENT = {
    textBody: null,
    videoAssetId: null,
    videoExternalUrl: null,
    videoProvider: null,
    videoDurationSeconds: null,
    videoFileSize: null,
    videoMimeType: null,
    videoStatus: null,
    documentAssetId: null,
    documentFileName: null,
    documentFileSize: null,
    documentMimeType: null,
    documentFileType: null,
    documentDownloadAllowed: null,
};
const MAX_POSITION = 2_147_483_647;
function findTemporaryPositions(reservedValues, count) {
    const reserved = [...new Set(reservedValues)].sort((left, right) => left - right);
    const positions = [];
    let candidate = 0;
    for (const value of reserved) {
        while (candidate < value && positions.length < count)
            positions.push(candidate++);
        if (positions.length === count)
            return positions;
        if (candidate === value)
            candidate++;
    }
    while (candidate <= MAX_POSITION && positions.length < count)
        positions.push(candidate++);
    return positions.length === count ? positions : undefined;
}
const CONTENT_KEYS = {
    [LessonType.TEXT]: ['textBody'],
    [LessonType.VIDEO]: ['videoUrl'],
    [LessonType.DOCUMENT]: [
        'documentAssetId',
        'documentFileName',
        'documentFileSize',
        'documentDownloadAllowed',
    ],
};
function externalProvider(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new BadRequestException('content.videoUrl must be a valid URL');
    }
    if (url.protocol !== 'https:')
        throw new BadRequestException('content.videoUrl must use https');
    const host = url.hostname.toLowerCase();
    const is = (domain) => host === domain || host.endsWith(`.${domain}`);
    if (is('youtube.com') || is('youtu.be'))
        return VideoProvider.YOUTUBE;
    if (is('vimeo.com'))
        return VideoProvider.VIMEO;
    throw new BadRequestException('content.videoUrl must be a YouTube or Vimeo URL');
}
export function buildContent(type, content) {
    const allowed = new Set(CONTENT_KEYS[type]);
    const unexpected = Object.keys(content).filter((key) => content[key] !== undefined && !allowed.has(key));
    if (unexpected.length)
        throw new BadRequestException(`content fields ${unexpected.join(', ')} are not valid for type ${type}`);
    const columns = { ...EMPTY_CONTENT };
    if (type === LessonType.TEXT) {
        if (!content.textBody?.trim())
            throw new BadRequestException('content.textBody is required for TEXT');
        const sanitized = sanitizeLessonHtml(content.textBody);
        if (!sanitized)
            throw new BadRequestException('content.textBody must contain safe, non-empty content');
        columns.textBody = sanitized;
        return { columns, publishable: true };
    }
    if (type === LessonType.VIDEO) {
        if (content.videoUrl === undefined)
            throw new BadRequestException('content.videoUrl is required; managed videos must use video-upload');
        columns.videoExternalUrl = content.videoUrl;
        columns.videoProvider = externalProvider(content.videoUrl);
        columns.videoStatus = MediaProcessingStatus.READY;
        return { columns, publishable: true };
    }
    if (!content.documentAssetId?.trim() ||
        !content.documentFileName?.trim() ||
        content.documentFileSize === undefined ||
        content.documentDownloadAllowed === undefined)
        throw new BadRequestException('content.documentAssetId, documentFileName, documentFileSize and documentDownloadAllowed are required for DOCUMENT');
    columns.documentAssetId = content.documentAssetId;
    columns.documentFileName = content.documentFileName;
    columns.documentFileSize = String(content.documentFileSize);
    columns.documentDownloadAllowed = content.documentDownloadAllowed;
    return { columns, publishable: true };
}
function slugify(title) {
    return (title
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 200) || 'lesson');
}
let LessonsService = LessonsService_1 = class LessonsService {
    dataSource;
    mediaStorage;
    logger = new Logger(LessonsService_1.name);
    constructor(dataSource, mediaStorage) {
        this.dataSource = dataSource;
        this.mediaStorage = mediaStorage;
    }
    async lockChapter(manager, chapterId) {
        const chapter = await manager.getRepository(Chapter).findOne({
            where: { id: chapterId },
            select: { id: true, courseId: true },
            lock: { mode: 'pessimistic_write' },
        });
        if (!chapter)
            throw new NotFoundException('Chapter not found');
        return chapter;
    }
    async assertPositionFree(manager, chapterId, position, exceptId) {
        const existing = await manager
            .getRepository(Lesson)
            .findOne({ where: { chapterId, position }, select: { id: true } });
        if (existing && existing.id !== exceptId)
            throw new ConflictException('Lesson position is already in use');
    }
    create(chapterId, dto) {
        return this.dataSource.transaction(async (manager) => {
            const chapter = await this.lockChapter(manager, chapterId);
            const repository = manager.getRepository(Lesson);
            const { columns, publishable } = buildContent(dto.type, dto.content);
            let position = dto.position;
            if (position === undefined) {
                const aggregate = await repository
                    .createQueryBuilder('lesson')
                    .select('MAX(lesson.position)', 'maxPosition')
                    .where('lesson.chapterId = :chapterId', { chapterId })
                    .getRawOne();
                position = Number(aggregate?.maxPosition ?? -1) + 1;
            }
            else
                await this.assertPositionFree(manager, chapterId, position);
            const base = slugify(dto.title);
            const slugs = new Set((await repository.find({
                where: { chapterId },
                select: { slug: true },
            })).map(({ slug }) => slug));
            let slug = base;
            for (let suffix = 2; slugs.has(slug); suffix++)
                slug = `${base}-${suffix}`;
            return repository.save(repository.create({
                courseId: chapter.courseId,
                chapterId,
                title: dto.title,
                slug,
                type: dto.type,
                position,
                isPreview: dto.isPreview ?? false,
                isPublished: publishable,
                ...columns,
            }));
        });
    }
    list(chapterId) {
        return this.dataSource.getRepository(Lesson).find({
            where: { chapterId },
            order: { position: 'ASC', id: 'ASC' },
        });
    }
    async createUploadedVideo(chapterId, dto, file) {
        if (!dto.title?.trim())
            throw new BadRequestException('title is required');
        if (!file?.buffer?.length)
            throw new BadRequestException('A video file is required');
        const chapter = await this.dataSource.getRepository(Chapter).findOne({
            where: { id: chapterId },
            select: { id: true, courseId: true },
        });
        if (!chapter)
            throw new NotFoundException('Chapter not found');
        const lessonId = randomUUID();
        const storageKey = this.videoStorageKey(chapter.courseId, lessonId, file.originalname);
        const stored = await this.mediaStorage.upload(file, storageKey, {
            kind: 'video',
        });
        try {
            return await this.dataSource.transaction(async (manager) => {
                const lockedChapter = await this.lockChapter(manager, chapterId);
                const repository = manager.getRepository(Lesson);
                const aggregate = await repository
                    .createQueryBuilder('lesson')
                    .select('MAX(lesson.position)', 'maxPosition')
                    .where('lesson.chapterId = :chapterId', { chapterId })
                    .getRawOne();
                const base = slugify(dto.title);
                const slugs = new Set((await repository.find({
                    where: { chapterId },
                    select: { slug: true },
                })).map(({ slug }) => slug));
                let slug = base;
                for (let suffix = 2; slugs.has(slug); suffix++)
                    slug = `${base}-${suffix}`;
                return repository.save(repository.create({
                    id: lessonId,
                    courseId: lockedChapter.courseId,
                    chapterId,
                    title: dto.title,
                    slug,
                    type: LessonType.VIDEO,
                    position: Number(aggregate?.maxPosition ?? -1) + 1,
                    isPreview: dto.isPreview ?? false,
                    isPublished: true,
                    ...EMPTY_CONTENT,
                    videoAssetId: stored.filePath,
                    videoProvider: this.mediaStorage.provider === 'LOCAL'
                        ? VideoProvider.LOCAL
                        : VideoProvider.S3,
                    videoDurationSeconds: dto.durationSeconds ?? null,
                    videoFileSize: String(stored.size),
                    videoMimeType: stored.contentType,
                    videoStatus: MediaProcessingStatus.READY,
                }));
            });
        }
        catch (error) {
            await this.mediaStorage.delete(stored.filePath).catch(() => undefined);
            throw error;
        }
    }
    async replaceUploadedVideo(id, dto, file) {
        if (!file?.buffer?.length)
            throw new BadRequestException('A video file is required');
        const existing = await this.dataSource.getRepository(Lesson).findOne({
            where: { id },
            select: {
                id: true,
                courseId: true,
                chapterId: true,
                type: true,
                videoAssetId: true,
            },
        });
        if (!existing)
            throw new NotFoundException('Lesson not found');
        if (existing.type !== LessonType.VIDEO)
            throw new BadRequestException('Only VIDEO lessons accept video uploads');
        const storageKey = this.videoStorageKey(existing.courseId, id, file.originalname);
        const stored = await this.mediaStorage.upload(file, storageKey, {
            kind: 'video',
        });
        let lesson;
        let replacedAssetId = null;
        try {
            lesson = await this.dataSource.transaction(async (manager) => {
                await this.lockChapter(manager, existing.chapterId);
                const repository = manager.getRepository(Lesson);
                const locked = await repository.findOne({
                    where: { id, chapterId: existing.chapterId },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!locked)
                    throw new NotFoundException('Lesson not found');
                if (locked.type !== LessonType.VIDEO)
                    throw new BadRequestException('Only VIDEO lessons accept video uploads');
                replacedAssetId = locked.videoAssetId;
                await repository.update({ id }, {
                    ...(dto.title !== undefined ? { title: dto.title } : {}),
                    ...(dto.isPreview !== undefined
                        ? { isPreview: dto.isPreview }
                        : {}),
                    videoAssetId: stored.filePath,
                    videoExternalUrl: null,
                    videoProvider: this.mediaStorage.provider === 'LOCAL'
                        ? VideoProvider.LOCAL
                        : VideoProvider.S3,
                    videoDurationSeconds: dto.durationSeconds ?? null,
                    videoFileSize: String(stored.size),
                    videoMimeType: stored.contentType,
                    videoStatus: MediaProcessingStatus.READY,
                    isPublished: true,
                });
                return repository.findOneByOrFail({ id });
            });
        }
        catch (error) {
            await this.mediaStorage.delete(stored.filePath).catch(() => undefined);
            throw error;
        }
        await this.cleanupManagedVideo(replacedAssetId);
        return lesson;
    }
    async createUploadedDocument(chapterId, dto, file) {
        if (!dto.title?.trim())
            throw new BadRequestException('title is required');
        if (!file?.buffer?.length)
            throw new BadRequestException('A document file is required');
        const chapter = await this.dataSource.getRepository(Chapter).findOne({
            where: { id: chapterId },
            select: { id: true, courseId: true },
        });
        if (!chapter)
            throw new NotFoundException('Chapter not found');
        const lessonId = randomUUID();
        const stored = await this.mediaStorage.upload(file, this.documentStorageKey(chapter.courseId, lessonId, file.originalname), { kind: 'document' });
        try {
            return await this.dataSource.transaction(async (manager) => {
                const lockedChapter = await this.lockChapter(manager, chapterId);
                const repository = manager.getRepository(Lesson);
                const aggregate = await repository
                    .createQueryBuilder('lesson')
                    .select('MAX(lesson.position)', 'maxPosition')
                    .where('lesson.chapterId = :chapterId', { chapterId })
                    .getRawOne();
                const base = slugify(dto.title);
                const slugs = new Set((await repository.find({
                    where: { chapterId },
                    select: { slug: true },
                })).map(({ slug }) => slug));
                let slug = base;
                for (let suffix = 2; slugs.has(slug); suffix++)
                    slug = `${base}-${suffix}`;
                return repository.save(repository.create({
                    id: lessonId,
                    courseId: lockedChapter.courseId,
                    chapterId,
                    title: dto.title,
                    slug,
                    type: LessonType.DOCUMENT,
                    position: Number(aggregate?.maxPosition ?? -1) + 1,
                    isPreview: dto.isPreview ?? false,
                    isPublished: true,
                    ...EMPTY_CONTENT,
                    documentAssetId: stored.filePath,
                    documentFileName: file.originalname,
                    documentFileSize: String(stored.size),
                    documentMimeType: stored.contentType,
                    documentFileType: this.documentFileType(stored.contentType),
                    documentDownloadAllowed: dto.allowDownload ?? false,
                }));
            });
        }
        catch (error) {
            await this.mediaStorage.delete(stored.filePath).catch(() => undefined);
            throw error;
        }
    }
    async replaceUploadedDocument(id, dto, file) {
        if (!file?.buffer?.length)
            throw new BadRequestException('A document file is required');
        const existing = await this.dataSource.getRepository(Lesson).findOne({
            where: { id },
            select: {
                id: true,
                courseId: true,
                chapterId: true,
                type: true,
            },
        });
        if (!existing)
            throw new NotFoundException('Lesson not found');
        if (existing.type !== LessonType.DOCUMENT)
            throw new BadRequestException('Only DOCUMENT lessons accept document uploads');
        const stored = await this.mediaStorage.upload(file, this.documentStorageKey(existing.courseId, id, file.originalname), { kind: 'document' });
        let replacedAssetId = null;
        let lesson;
        try {
            lesson = await this.dataSource.transaction(async (manager) => {
                await this.lockChapter(manager, existing.chapterId);
                const repository = manager.getRepository(Lesson);
                const locked = await repository.findOne({
                    where: { id, chapterId: existing.chapterId },
                    lock: { mode: 'pessimistic_write' },
                });
                if (!locked)
                    throw new NotFoundException('Lesson not found');
                if (locked.type !== LessonType.DOCUMENT)
                    throw new BadRequestException('Only DOCUMENT lessons accept document uploads');
                replacedAssetId = locked.documentAssetId;
                await repository.update({ id }, {
                    ...(dto.title !== undefined ? { title: dto.title } : {}),
                    ...(dto.isPreview !== undefined
                        ? { isPreview: dto.isPreview }
                        : {}),
                    ...(dto.allowDownload !== undefined
                        ? { documentDownloadAllowed: dto.allowDownload }
                        : {}),
                    documentAssetId: stored.filePath,
                    documentFileName: file.originalname,
                    documentFileSize: String(stored.size),
                    documentMimeType: stored.contentType,
                    documentFileType: this.documentFileType(stored.contentType),
                    isPublished: true,
                });
                return repository.findOneByOrFail({ id });
            });
        }
        catch (error) {
            await this.mediaStorage.delete(stored.filePath).catch(() => undefined);
            throw error;
        }
        await this.cleanupManagedMedia(replacedAssetId, 'Document');
        return lesson;
    }
    async updateDocumentSettings(id, dto) {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Lesson);
            const lesson = await repository.findOne({
                where: { id },
                select: { id: true, chapterId: true, type: true },
            });
            if (!lesson)
                throw new NotFoundException('Lesson not found');
            if (lesson.type !== LessonType.DOCUMENT)
                throw new BadRequestException('Lesson is not a document');
            await this.lockChapter(manager, lesson.chapterId);
            await repository.update({ id, type: LessonType.DOCUMENT }, { documentDownloadAllowed: dto.allowDownload });
            return repository.findOneByOrFail({ id });
        });
    }
    reorder(chapterId, dto) {
        return this.dataSource.transaction(async (manager) => {
            await this.lockChapter(manager, chapterId);
            const repository = manager.getRepository(Lesson);
            const lessons = await repository.find({
                where: { chapterId },
                select: { id: true, position: true },
                lock: { mode: 'pessimistic_write' },
            });
            const submittedIds = new Set(dto.lessonOrders.map(({ id }) => id));
            const submittedPositions = dto.lessonOrders.map(({ position }) => position);
            if (dto.lessonOrders.length !== lessons.length ||
                submittedIds.size !== dto.lessonOrders.length ||
                lessons.some((lesson) => !submittedIds.has(lesson.id)))
                throw new BadRequestException('lessonOrders must contain every lesson in this chapter exactly once');
            if (new Set(submittedPositions).size !== submittedPositions.length)
                throw new BadRequestException('Lesson positions must be unique');
            const temporaryPositions = findTemporaryPositions([...lessons.map(({ position }) => position), ...submittedPositions], lessons.length);
            if (!temporaryPositions)
                throw new BadRequestException('No safe temporary positions available');
            for (const [index, lesson] of lessons.entries()) {
                const result = await repository.update({ id: lesson.id, chapterId }, { position: temporaryPositions[index] });
                if (!result.affected)
                    throw new NotFoundException('Lesson not found');
            }
            for (const lesson of dto.lessonOrders) {
                const result = await repository.update({ id: lesson.id, chapterId }, { position: lesson.position });
                if (!result.affected)
                    throw new NotFoundException('Lesson not found');
            }
            return repository.find({
                where: { chapterId },
                order: { position: 'ASC', id: 'ASC' },
            });
        });
    }
    async get(id) {
        const lesson = await this.dataSource
            .getRepository(Lesson)
            .findOneBy({ id });
        if (!lesson)
            throw new NotFoundException('Lesson not found');
        return lesson;
    }
    async update(id, dto) {
        let previousVideoAssetId = null;
        let previousDocumentAssetId = null;
        const updated = await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Lesson);
            const found = await repository.findOne({
                where: { id },
                select: { id: true, chapterId: true },
            });
            if (!found)
                throw new NotFoundException('Lesson not found');
            await this.lockChapter(manager, found.chapterId);
            const lesson = await repository.findOne({
                where: { id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!lesson)
                throw new NotFoundException('Lesson not found');
            previousVideoAssetId = lesson.videoAssetId;
            previousDocumentAssetId = lesson.documentAssetId;
            const type = dto.type ?? lesson.type;
            if (dto.type && dto.type !== lesson.type && !dto.content)
                throw new BadRequestException('content is required when changing type');
            const changes = {};
            if (dto.title !== undefined)
                changes.title = dto.title;
            if (dto.isPreview !== undefined)
                changes.isPreview = dto.isPreview;
            if (dto.type !== undefined)
                changes.type = dto.type;
            if (dto.content) {
                const { columns, publishable } = buildContent(type, dto.content);
                Object.assign(changes, columns, { isPublished: publishable });
            }
            if (dto.isPublished !== undefined)
                changes.isPublished = dto.isPublished;
            if (dto.position !== undefined) {
                await this.assertPositionFree(manager, lesson.chapterId, dto.position, id);
                changes.position = dto.position;
            }
            if (Object.keys(changes).length)
                await repository.update({ id }, changes);
            return repository.findOneByOrFail({ id });
        });
        if (previousVideoAssetId && previousVideoAssetId !== updated.videoAssetId)
            await this.cleanupManagedVideo(previousVideoAssetId);
        if (previousDocumentAssetId &&
            previousDocumentAssetId !== updated.documentAssetId)
            await this.cleanupManagedMedia(previousDocumentAssetId, 'Document');
        return updated;
    }
    async remove(id) {
        let videoAssetId = null;
        let documentAssetId = null;
        await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Lesson);
            const found = await repository.findOne({
                where: { id },
                select: {
                    id: true,
                    chapterId: true,
                    videoAssetId: true,
                    documentAssetId: true,
                },
            });
            if (!found)
                throw new NotFoundException('Lesson not found');
            videoAssetId = found.videoAssetId;
            documentAssetId = found.documentAssetId;
            await this.lockChapter(manager, found.chapterId);
            const result = await repository.delete({ id });
            if (!result.affected)
                throw new NotFoundException('Lesson not found');
        });
        await this.cleanupManagedVideo(videoAssetId);
        await this.cleanupManagedMedia(documentAssetId, 'Document');
    }
    videoStorageKey(courseId, lessonId, originalName) {
        return `attached/${courseId}/${lessonId}/${randomUUID()}${extname(originalName).toLowerCase()}`;
    }
    documentStorageKey(courseId, lessonId, originalName) {
        return `attached/${courseId}/${lessonId}/${randomUUID()}${extname(originalName).toLowerCase()}`;
    }
    documentFileType(contentType) {
        if (contentType === 'application/pdf')
            return DocumentFileType.PDF;
        if (contentType ===
            'application/vnd.openxmlformats-officedocument.presentationml.presentation')
            return DocumentFileType.SLIDE;
        if (contentType ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            return DocumentFileType.DOCX;
        return DocumentFileType.OTHER;
    }
    async cleanupManagedVideo(storageKey) {
        return this.cleanupManagedMedia(storageKey, 'Video');
    }
    async cleanupManagedMedia(storageKey, label) {
        if (!storageKey)
            return;
        try {
            await this.mediaStorage.delete(storageKey);
        }
        catch {
            this.logger.warn(`${label} cleanup deferred for ${storageKey}`);
        }
    }
};
LessonsService = LessonsService_1 = __decorate([
    Injectable(),
    __param(1, Inject(MEDIA_STORAGE_DRIVER)),
    __metadata("design:paramtypes", [DataSource, Object])
], LessonsService);
export { LessonsService };
//# sourceMappingURL=lessons.service.js.map