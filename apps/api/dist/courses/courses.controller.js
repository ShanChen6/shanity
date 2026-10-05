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
import { Body, Controller, Get, Header, ParseUUIDPipe, Param, Patch, Post, Query, Req, UseGuards, } from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../auth/auth.guards.js';
import { CourseOwnershipGuard, RequireCourseOwnership, } from './course-ownership.guard.js';
import { CreateCourseDto, UpdateCourseDto } from './courses.dto.js';
import { PublicCourseQueryDto } from './public-courses.dto.js';
import { CoursesService } from './courses.service.js';
let CoursesController = class CoursesController {
    courses;
    constructor(courses) {
        this.courses = courses;
    }
    create(req, dto) {
        return this.courses.create(req.principal, dto);
    }
    list(req) {
        return this.courses.list(req.principal);
    }
    get(req) {
        return req.course;
    }
    enroll(req, courseId) {
        return this.courses.enroll(req.principal.id, courseId);
    }
    enrollmentStatus(req, courseId) {
        return this.courses.enrollmentStatus(req.principal.id, courseId);
    }
    update(req, _id, dto) {
        return this.courses.update(req.course, dto);
    }
    publish(id) {
        return this.courses.publish(id);
    }
    unpublish(id) {
        return this.courses.unpublish(id);
    }
    archive(id) {
        return this.courses.archive(id);
    }
};
__decorate([
    Post(),
    Roles('instructor', 'admin'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateCourseDto]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "create", null);
__decorate([
    Get(),
    Roles('student', 'instructor', 'admin'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "list", null);
__decorate([
    Get(':id'),
    Roles('student', 'instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'course', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "get", null);
__decorate([
    Post(':courseId/enroll'),
    Roles('student'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('courseId', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "enroll", null);
__decorate([
    Get(':courseId/enrollment-status'),
    Roles('student'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('courseId', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "enrollmentStatus", null);
__decorate([
    Patch(':id'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'course', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id')),
    __param(2, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, UpdateCourseDto]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "update", null);
__decorate([
    Post(':id/publish'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'course', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "publish", null);
__decorate([
    Post(':id/unpublish'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'course', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "unpublish", null);
__decorate([
    Post(':id/archive'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'course', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "archive", null);
CoursesController = __decorate([
    Controller('courses'),
    UseGuards(OriginGuard, SessionGuard),
    __metadata("design:paramtypes", [CoursesService])
], CoursesController);
export { CoursesController };
let PublicCoursesController = class PublicCoursesController {
    courses;
    constructor(courses) {
        this.courses = courses;
    }
    list(query) {
        return this.courses.listPublic(query);
    }
    detail(slug) {
        return this.courses.getPublicBySlug(slug);
    }
};
__decorate([
    Get(),
    Header('Cache-Control', 'public, max-age=60'),
    __param(0, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PublicCourseQueryDto]),
    __metadata("design:returntype", void 0)
], PublicCoursesController.prototype, "list", null);
__decorate([
    Get(':slug'),
    Header('Cache-Control', 'public, max-age=60'),
    __param(0, Param('slug')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PublicCoursesController.prototype, "detail", null);
PublicCoursesController = __decorate([
    Controller('public/courses'),
    __metadata("design:paramtypes", [CoursesService])
], PublicCoursesController);
export { PublicCoursesController };
//# sourceMappingURL=courses.controller.js.map