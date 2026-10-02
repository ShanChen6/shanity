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
import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Req, UseGuards, } from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../auth/auth.guards.js';
import { CourseOwnershipGuard, RequireCourseOwnership, } from './course-ownership.guard.js';
import { CreateChapterDto, ReorderChaptersDto, UpdateChapterDto, } from './chapters.dto.js';
import { ChaptersService } from './chapters.service.js';
let ChaptersController = class ChaptersController {
    chapters;
    constructor(chapters) {
        this.chapters = chapters;
    }
    create(req, dto) {
        return this.chapters.create(req.course.id, dto);
    }
    list(req) {
        return this.chapters.list(req.course.id);
    }
    reorder(req, dto) {
        return this.chapters.reorder(req.course.id, dto);
    }
    update(id, dto) {
        return this.chapters.update(id, dto);
    }
    remove(id) {
        return this.chapters.remove(id);
    }
};
__decorate([
    Post('courses/:courseId/chapters'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'course', param: 'courseId' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateChapterDto]),
    __metadata("design:returntype", void 0)
], ChaptersController.prototype, "create", null);
__decorate([
    Get('courses/:courseId/chapters'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'course', param: 'courseId' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], ChaptersController.prototype, "list", null);
__decorate([
    Patch('courses/:courseId/chapters/reorder'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'course', param: 'courseId' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ReorderChaptersDto]),
    __metadata("design:returntype", void 0)
], ChaptersController.prototype, "reorder", null);
__decorate([
    Patch('chapters/:id'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'chapter', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id')),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateChapterDto]),
    __metadata("design:returntype", void 0)
], ChaptersController.prototype, "update", null);
__decorate([
    Delete('chapters/:id'),
    Roles('instructor', 'admin'),
    UseGuards(CourseOwnershipGuard),
    RequireCourseOwnership({ resource: 'chapter', param: 'id' }),
    HttpCode(204),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ChaptersController.prototype, "remove", null);
ChaptersController = __decorate([
    Controller(),
    UseGuards(OriginGuard, SessionGuard),
    __metadata("design:paramtypes", [ChaptersService])
], ChaptersController);
export { ChaptersController };
//# sourceMappingURL=chapters.controller.js.map