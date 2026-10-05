var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { Chapter } from '../../courses/chapter.entity.js';
import { Course } from '../../courses/course.entity.js';
import { Lesson } from './entities/lesson.entity.js';
const FORBIDDEN_MESSAGE = 'You do not have permission to modify this lesson';
let LessonOwnershipGuard = class LessonOwnershipGuard {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const params = request.params;
        const chapterId = params.chapterId;
        const lessonId = params.lessonId ?? params.id;
        const ownership = chapterId && isUUID(chapterId, '4')
            ? await this.findChapterOwnership(chapterId)
            : lessonId && isUUID(lessonId, '4')
                ? await this.findLessonOwnership(lessonId)
                : undefined;
        if (!ownership)
            throw new ForbiddenException(FORBIDDEN_MESSAGE);
        if (request.principal.roles.includes('admin'))
            return true;
        if (request.principal.roles.includes('instructor') &&
            ownership.instructorId === request.principal.id)
            return true;
        throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }
    findChapterOwnership(chapterId) {
        return this.dataSource
            .getRepository(Chapter)
            .createQueryBuilder('chapter')
            .innerJoin(Course, 'course', 'course.id = chapter.courseId')
            .select('course.instructorId', 'instructorId')
            .where('chapter.id = :chapterId', { chapterId })
            .getRawOne();
    }
    findLessonOwnership(lessonId) {
        return this.dataSource
            .getRepository(Lesson)
            .createQueryBuilder('lesson')
            .innerJoin(Chapter, 'chapter', 'chapter.id = lesson.chapterId')
            .innerJoin(Course, 'course', 'course.id = chapter.courseId')
            .select('course.instructorId', 'instructorId')
            .where('lesson.id = :lessonId', { lessonId })
            .getRawOne();
    }
};
LessonOwnershipGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource])
], LessonOwnershipGuard);
export { LessonOwnershipGuard };
//# sourceMappingURL=lesson-ownership.guard.js.map