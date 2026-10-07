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
import { DataSource } from 'typeorm';
import { CourseOwnershipService } from './course-ownership.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const body = (statusCode, code) => ({
    statusCode,
    message: code,
    code,
});
let CourseEnrollmentGuard = class CourseEnrollmentGuard {
    dataSource;
    ownership;
    constructor(dataSource, ownership) {
        this.dataSource = dataSource;
        this.ownership = ownership;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const courseId = request.params
            .courseId;
        if (!courseId || !UUID.test(courseId))
            throw new NotFoundException(body(404, 'COURSE_NOT_FOUND'));
        const [course] = await this.dataSource.query(`SELECT course.status,
         enrollment.user_id IS NOT NULL AS enrolled,
         enrollment.revoked_at IS NOT NULL AS revoked
       FROM courses course
       LEFT JOIN enrollments enrollment
         ON enrollment.course_id = course.id AND enrollment.user_id = $2
       WHERE course.id = $1`, [courseId, request.principal.id]);
        if (!course)
            throw new NotFoundException(body(404, 'COURSE_NOT_FOUND'));
        if (await this.ownership.canManageCourse(request.principal, courseId))
            return true;
        if (course.status !== 'published')
            throw new ForbiddenException(body(403, 'COURSE_UNAVAILABLE'));
        if (!course.enrolled)
            throw new ForbiddenException(body(403, 'ENROLLMENT_REQUIRED'));
        if (course.revoked)
            throw new ForbiddenException(body(403, 'ENROLLMENT_SUSPENDED'));
        return true;
    }
};
CourseEnrollmentGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        CourseOwnershipService])
], CourseEnrollmentGuard);
export { CourseEnrollmentGuard };
//# sourceMappingURL=course-enrollment.guard.js.map