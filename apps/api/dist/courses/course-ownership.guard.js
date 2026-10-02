var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, ForbiddenException, Injectable, NotFoundException, SetMetadata, } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { Chapter } from './chapter.entity.js';
import { Course } from './course.entity.js';
import { CourseStatus } from './course-status.js';
const COURSE_OWNERSHIP = 'courseOwnership';
export const RequireCourseOwnership = (options = {}) => SetMetadata(COURSE_OWNERSHIP, options);
let CourseOwnershipGuard = class CourseOwnershipGuard {
    dataSource;
    reflector;
    constructor(dataSource, reflector) {
        this.dataSource = dataSource;
        this.reflector = reflector;
    }
    async canActivate(context) {
        const options = this.reflector.getAllAndOverride(COURSE_OWNERSHIP, [context.getHandler(), context.getClass()]);
        if (!options)
            return true;
        const request = context.switchToHttp().getRequest();
        const body = request.body;
        const resourceId = this.resourceId(request, options, body);
        if (!resourceId)
            throw new BadRequestException('Course id is required');
        if (!isUUID(resourceId, '4'))
            throw new BadRequestException('Invalid UUID');
        let courseId = resourceId;
        if (options.resource === 'chapter') {
            const chapter = await this.dataSource
                .getRepository(Chapter)
                .findOne({ where: { id: resourceId }, select: { id: true, courseId: true } });
            if (!chapter)
                throw new NotFoundException('Chapter not found');
            courseId = chapter.courseId;
        }
        const course = await this.dataSource
            .getRepository(Course)
            .findOne({ where: { id: courseId } });
        if (!course)
            throw new NotFoundException('Course not found');
        request.course = course;
        const principal = request.principal;
        if (principal.roles.includes('admin'))
            return true;
        if (principal.roles.includes('instructor')) {
            if (course.ownerId === principal.id)
                return true;
            throw new ForbiddenException();
        }
        if (request.method === 'GET' &&
            principal.roles.includes('student') &&
            course.status === CourseStatus.PUBLISHED)
            return true;
        throw new ForbiddenException();
    }
    resourceId(request, options, body) {
        const params = request.params;
        const candidates = options.resource === 'chapter'
            ? [options.param && params[options.param], params.chapterId, params.id]
            : [
                options.param && params[options.param],
                params.id,
                params.courseId,
                body?.courseId,
            ];
        return candidates.find((value) => typeof value === 'string');
    }
};
CourseOwnershipGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        Reflector])
], CourseOwnershipGuard);
export { CourseOwnershipGuard };
//# sourceMappingURL=course-ownership.guard.js.map