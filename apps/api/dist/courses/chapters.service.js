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
var ChaptersService_1;
import { BadRequestException, Inject, Injectable, Logger, NotFoundException, } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Chapter } from './chapter.entity.js';
import { Course } from './course.entity.js';
import { Lesson } from '../modules/lessons/entities/lesson.entity.js';
import { MEDIA_STORAGE_DRIVER } from '../storage/media-storage.constants.js';
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
let ChaptersService = ChaptersService_1 = class ChaptersService {
    dataSource;
    mediaStorage;
    logger = new Logger(ChaptersService_1.name);
    constructor(dataSource, mediaStorage) {
        this.dataSource = dataSource;
        this.mediaStorage = mediaStorage;
    }
    create(courseId, dto) {
        return this.dataSource.transaction(async (manager) => {
            const course = await manager.getRepository(Course).findOne({
                where: { id: courseId },
                select: { id: true },
                lock: { mode: 'pessimistic_write' },
            });
            if (!course)
                throw new NotFoundException('Course not found');
            let position = dto.position;
            if (position === undefined) {
                const aggregate = await manager
                    .getRepository(Chapter)
                    .createQueryBuilder('chapter')
                    .select('MAX(chapter.position)', 'maxPosition')
                    .where('chapter.courseId = :courseId', { courseId })
                    .getRawOne();
                position = Number(aggregate?.maxPosition ?? -1) + 1;
            }
            const repository = manager.getRepository(Chapter);
            return repository.save(repository.create({
                courseId,
                title: dto.title,
                description: dto.description,
                position,
            }));
        });
    }
    list(courseId) {
        return this.dataSource.getRepository(Chapter).find({
            where: { courseId },
            order: { position: 'ASC', id: 'ASC' },
        });
    }
    async update(id, dto) {
        return this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Chapter);
            const existing = await repository.findOne({
                where: { id },
                select: { id: true, courseId: true },
            });
            if (!existing)
                throw new NotFoundException('Chapter not found');
            const course = await manager.getRepository(Course).findOne({
                where: { id: existing.courseId },
                select: { id: true },
                lock: { mode: 'pessimistic_write' },
            });
            if (!course)
                throw new NotFoundException('Course not found');
            const chapter = await repository.findOne({
                where: { id, courseId: course.id },
                lock: { mode: 'pessimistic_write' },
            });
            if (!chapter)
                throw new NotFoundException('Chapter not found');
            await repository.update({ id, courseId: course.id }, dto);
            return repository.findOneByOrFail({ id });
        });
    }
    async remove(id) {
        let mediaKeys = [];
        await this.dataSource.transaction(async (manager) => {
            const repository = manager.getRepository(Chapter);
            const existing = await repository.findOne({
                where: { id },
                select: { id: true, courseId: true },
            });
            if (!existing)
                throw new NotFoundException('Chapter not found');
            const course = await manager.getRepository(Course).findOne({
                where: { id: existing.courseId },
                select: { id: true },
                lock: { mode: 'pessimistic_write' },
            });
            if (!course)
                throw new NotFoundException('Course not found');
            mediaKeys = await manager
                .getRepository(Lesson)
                .find({
                where: { chapterId: id },
                select: { videoAssetId: true, documentAssetId: true },
            })
                .then((lessons) => lessons.flatMap(({ videoAssetId, documentAssetId }) => [
                ...(videoAssetId
                    ? [{ key: videoAssetId, label: 'Video' }]
                    : []),
                ...(documentAssetId
                    ? [{ key: documentAssetId, label: 'Document' }]
                    : []),
            ]));
            const result = await repository.delete({ id, courseId: course.id });
            if (!result.affected)
                throw new NotFoundException('Chapter not found');
        });
        for (const media of mediaKeys) {
            try {
                await this.mediaStorage.delete(media.key);
            }
            catch {
                this.logger.warn(`${media.label} cleanup deferred for ${media.key}`);
            }
        }
    }
    reorder(courseId, dto) {
        return this.dataSource.transaction(async (manager) => {
            const course = await manager.getRepository(Course).findOne({
                where: { id: courseId },
                select: { id: true },
                lock: { mode: 'pessimistic_write' },
            });
            if (!course)
                throw new NotFoundException('Course not found');
            const repository = manager.getRepository(Chapter);
            const chapters = await repository.find({
                where: { courseId },
                select: { id: true, position: true },
                lock: { mode: 'pessimistic_write' },
            });
            const submittedIds = new Set(dto.chapterOrders.map(({ id }) => id));
            const submittedPositions = dto.chapterOrders.map(({ position }) => position);
            if (dto.chapterOrders.length !== chapters.length ||
                submittedIds.size !== dto.chapterOrders.length ||
                chapters.some((chapter) => !submittedIds.has(chapter.id)))
                throw new BadRequestException('chapterOrders must contain every chapter in this course exactly once');
            if (new Set(submittedPositions).size !== submittedPositions.length)
                throw new BadRequestException('Chapter positions must be unique');
            const temporaryPositions = findTemporaryPositions([...chapters.map(({ position }) => position), ...submittedPositions], chapters.length);
            if (!temporaryPositions)
                throw new BadRequestException('No safe temporary positions available');
            for (const [index, chapter] of chapters.entries()) {
                const result = await repository.update({ id: chapter.id, courseId }, { position: temporaryPositions[index] });
                if (!result.affected)
                    throw new NotFoundException('Chapter not found');
            }
            for (const chapter of dto.chapterOrders) {
                const result = await repository.update({ id: chapter.id, courseId }, { position: chapter.position });
                if (!result.affected)
                    throw new NotFoundException('Chapter not found');
            }
            return repository.find({
                where: { courseId },
                order: { position: 'ASC', id: 'ASC' },
            });
        });
    }
};
ChaptersService = ChaptersService_1 = __decorate([
    Injectable(),
    __param(1, Inject(MEDIA_STORAGE_DRIVER)),
    __metadata("design:paramtypes", [DataSource, Object])
], ChaptersService);
export { ChaptersService };
//# sourceMappingURL=chapters.service.js.map