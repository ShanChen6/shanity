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
import { Controller, Get, Header, Param, ParseUUIDPipe, Query, Req, UseGuards, } from '@nestjs/common';
import { Roles, SessionGuard } from '../../../auth/auth.guards.js';
import { StudentsProgressQueryDto } from '../dto/students-progress-query.dto.js';
import { CourseOwnerGuard, } from '../guards/course-owner.guard.js';
import { InstructorProgressService } from '../services/instructor-progress.service.js';
let InstructorCourseController = class InstructorCourseController {
    progress;
    constructor(progress) {
        this.progress = progress;
    }
    studentsProgress(req, query) {
        return this.progress.studentsProgress(req.ownedCourse, query);
    }
    studentLessons(req, studentId) {
        return this.progress.studentLessons(req.ownedCourse, studentId);
    }
};
__decorate([
    Get('students-progress'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Query()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, StudentsProgressQueryDto]),
    __metadata("design:returntype", void 0)
], InstructorCourseController.prototype, "studentsProgress", null);
__decorate([
    Get('students/:studentId/progress'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Req()),
    __param(1, Param('studentId', new ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], InstructorCourseController.prototype, "studentLessons", null);
InstructorCourseController = __decorate([
    Controller('instructor/courses/:courseId'),
    UseGuards(SessionGuard, CourseOwnerGuard),
    Roles('instructor', 'admin'),
    __metadata("design:paramtypes", [InstructorProgressService])
], InstructorCourseController);
export { InstructorCourseController };
//# sourceMappingURL=instructor-course.controller.js.map