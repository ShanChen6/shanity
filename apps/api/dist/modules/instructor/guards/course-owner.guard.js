var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, NotFoundException, } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DatabaseService } from '../../../database/database.module.js';
export const COURSE_PROGRESS_FORBIDDEN = 'You do not have permission to view progress for this course';
let CourseOwnerGuard = class CourseOwnerGuard {
    database;
    constructor(database) {
        this.database = database;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const principal = request.principal;
        const courseId = request.params
            .courseId;
        const isAdmin = principal?.roles.includes('admin') ?? false;
        if (!principal || (!isAdmin && !principal.roles.includes('instructor')))
            throw new ForbiddenException(COURSE_PROGRESS_FORBIDDEN);
        if (!courseId || !isUUID(courseId, '4')) {
            if (isAdmin)
                throw new NotFoundException('Course not found');
            throw new ForbiddenException(COURSE_PROGRESS_FORBIDDEN);
        }
        const [course] = await this.database.dataSource.query(`SELECT id, title, owner_id AS "ownerId", instructor_id AS "instructorId"
       FROM courses WHERE id = $1`, [courseId]);
        if (isAdmin) {
            if (!course)
                throw new NotFoundException('Course not found');
        }
        else if (!course ||
            (course.ownerId !== principal.id && course.instructorId !== principal.id))
            throw new ForbiddenException(COURSE_PROGRESS_FORBIDDEN);
        request.ownedCourse = { id: course.id, title: course.title };
        return true;
    }
};
CourseOwnerGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService])
], CourseOwnerGuard);
export { CourseOwnerGuard };
//# sourceMappingURL=course-owner.guard.js.map