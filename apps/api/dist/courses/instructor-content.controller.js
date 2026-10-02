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
import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors, } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, ArrayUnique, IsIn, IsOptional, IsString, IsUUID, Length, Matches, } from 'class-validator';
import { DataSource } from 'typeorm';
import { OriginGuard, Roles, SessionGuard, } from '../auth/auth.guards.js';
import { CourseOwnershipGuard, RequireCourseOwnership, } from './course-ownership.guard.js';
import { normalizeAvatar, MAX_AVATAR_BYTES } from '../avatar/avatar.service.js';
class LessonDto {
    title;
    type;
    body;
    videoUrl;
}
__decorate([
    IsString(),
    Length(1, 255),
    Matches(/\S/),
    __metadata("design:type", String)
], LessonDto.prototype, "title", void 0);
__decorate([
    IsIn(['Article', 'Video', 'Quiz']),
    __metadata("design:type", String)
], LessonDto.prototype, "type", void 0);
__decorate([
    IsOptional(),
    IsString(),
    Length(0, 100000),
    __metadata("design:type", String)
], LessonDto.prototype, "body", void 0);
__decorate([
    IsOptional(),
    IsString(),
    Matches(/^https?:\/\/[^\s]+$/),
    __metadata("design:type", String)
], LessonDto.prototype, "videoUrl", void 0);
class LessonOrderDto {
    ids;
}
__decorate([
    IsArray(),
    ArrayUnique(),
    IsUUID('4', { each: true }),
    __metadata("design:type", Array)
], LessonOrderDto.prototype, "ids", void 0);
const fields = 'id, chapter_id AS "chapterId", title, type, body, video_storage_key AS "videoUrl", position';
let InstructorContentController = class InstructorContentController {
    database;
    constructor(database) {
        this.database = database;
    }
    async chapter(manager, courseId, chapterId) {
        await manager.query('SELECT id FROM courses WHERE id = $1 FOR UPDATE', [
            courseId,
        ]);
        const rows = await manager.query('SELECT id FROM chapters WHERE id = $1 AND course_id = $2', [chapterId, courseId]);
        if (!rows.length)
            throw new NotFoundException('Chapter not found');
    }
    list(req) {
        return this.database.query(`SELECT ${fields} FROM lessons WHERE course_id = $1 AND chapter_id IS NOT NULL ORDER BY position, id`, [req.course.id]);
    }
    create(req, chapterId, dto) {
        return this.database.transaction(async (manager) => {
            await this.chapter(manager, req.course.id, chapterId);
            const [lesson] = await manager.query(`INSERT INTO lessons(course_id, chapter_id, title, type, body, video_storage_key, position)
        SELECT $1, $2, $3, $4, $5, $6, COALESCE(MAX(position), -1) + 1 FROM lessons WHERE chapter_id = $2 RETURNING ${fields}`, [
                req.course.id,
                chapterId,
                dto.title.trim(),
                dto.type,
                dto.body ?? '',
                dto.videoUrl ?? null,
            ]);
            return lesson;
        });
    }
    reorder(req, chapterId, dto) {
        return this.database.transaction(async (manager) => {
            await this.chapter(manager, req.course.id, chapterId);
            const rows = await manager.query('SELECT id FROM lessons WHERE chapter_id = $1', [chapterId]);
            if (rows.length !== dto.ids.length ||
                rows.some((row) => !dto.ids.includes(row.id)))
                throw new BadRequestException('Include every lesson in this chapter exactly once');
            for (const [position, id] of dto.ids.entries())
                await manager.query('UPDATE lessons SET position = $1 WHERE id = $2 AND chapter_id = $3', [position, id, chapterId]);
            return manager.query(`SELECT ${fields} FROM lessons WHERE course_id = $1 AND chapter_id IS NOT NULL ORDER BY position, id`, [req.course.id]);
        });
    }
    update(req, id, dto) {
        return this.database.transaction(async (manager) => {
            await manager.query('SELECT id FROM courses WHERE id = $1 FOR UPDATE', [
                req.course.id,
            ]);
            const [lesson] = await manager.query(`UPDATE lessons SET title = $1, type = $2, body = $3, video_storage_key = $4 WHERE id = $5 AND course_id = $6 AND chapter_id IS NOT NULL RETURNING ${fields}`, [
                dto.title.trim(),
                dto.type,
                dto.body ?? '',
                dto.videoUrl ?? null,
                id,
                req.course.id,
            ]);
            if (!lesson)
                throw new NotFoundException('Lesson not found');
            return lesson;
        });
    }
    remove(req, id) {
        return this.database.transaction(async (manager) => {
            await manager.query('SELECT id FROM courses WHERE id = $1 FOR UPDATE', [
                req.course.id,
            ]);
            const rows = await manager.query('DELETE FROM lessons WHERE id = $1 AND course_id = $2 AND chapter_id IS NOT NULL RETURNING id', [id, req.course.id]);
            if (!rows[1])
                throw new NotFoundException('Lesson not found');
        });
    }
    async upload(req, file) {
        const data = await normalizeAvatar(file);
        const [media] = await this.database.query('INSERT INTO course_media(course_id, data) VALUES ($1, $2) RETURNING id', [req.course.id, data]);
        return { url: `/course-media/${media.id}` };
    }
};
__decorate([
    Header('Cache-Control', 'no-store'),
    Get('lessons'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], InstructorContentController.prototype, "list", null);
__decorate([
    Post('chapters/:chapterId/lessons'),
    __param(0, Req()),
    __param(1, Param('chapterId', new ParseUUIDPipe({ version: '4' }))),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, LessonDto]),
    __metadata("design:returntype", void 0)
], InstructorContentController.prototype, "create", null);
__decorate([
    Patch('chapters/:chapterId/lessons/reorder'),
    __param(0, Req()),
    __param(1, Param('chapterId', new ParseUUIDPipe({ version: '4' }))),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, LessonOrderDto]),
    __metadata("design:returntype", void 0)
], InstructorContentController.prototype, "reorder", null);
__decorate([
    Patch('lessons/:id'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe({ version: '4' }))),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, LessonDto]),
    __metadata("design:returntype", void 0)
], InstructorContentController.prototype, "update", null);
__decorate([
    Delete('lessons/:id'),
    HttpCode(204),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InstructorContentController.prototype, "remove", null);
__decorate([
    Post('thumbnail'),
    UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0 },
    })),
    __param(0, Req()),
    __param(1, UploadedFile()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], InstructorContentController.prototype, "upload", null);
InstructorContentController = __decorate([
    Controller('courses/:courseId'),
    UseGuards(OriginGuard, SessionGuard, CourseOwnershipGuard),
    Roles('instructor', 'admin'),
    RequireCourseOwnership({ resource: 'course', param: 'courseId' }),
    __metadata("design:paramtypes", [DataSource])
], InstructorContentController);
export { InstructorContentController };
let CourseMediaController = class CourseMediaController {
    database;
    constructor(database) {
        this.database = database;
    }
    async read(id) {
        const [media] = await this.database.query('SELECT data FROM course_media WHERE id = $1', [id]);
        if (!media)
            throw new NotFoundException();
        return new StreamableFile(media.data, {
            type: 'image/webp',
            disposition: 'inline',
        });
    }
};
__decorate([
    Get(':id'),
    Header('Cache-Control', 'public, max-age=31536000, immutable'),
    Header('X-Content-Type-Options', 'nosniff'),
    __param(0, Param('id', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], CourseMediaController.prototype, "read", null);
CourseMediaController = __decorate([
    Controller('course-media'),
    __metadata("design:paramtypes", [DataSource])
], CourseMediaController);
export { CourseMediaController };
//# sourceMappingURL=instructor-content.controller.js.map