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
import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards, } from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../../auth/auth.guards.js';
import { CourseOwnershipGuard, RequireCourseOwnership, } from '../../courses/course-ownership.guard.js';
import { CreateLessonDto, UpdateLessonDto } from './dto/lessons.dto.js';
import { LessonsService } from './lessons.service.js';
const uuid = () => new ParseUUIDPipe({ version: '4' });
let LessonsController = class LessonsController {
    lessons;
    constructor(lessons) {
        this.lessons = lessons;
    }
    create(chapterId, dto) {
        return this.lessons.create(chapterId, dto);
    }
    list(chapterId) {
        return this.lessons.list(chapterId);
    }
    get(id) {
        return this.lessons.get(id);
    }
    update(id, dto) {
        return this.lessons.update(id, dto);
    }
    remove(id) {
        return this.lessons.remove(id);
    }
};
__decorate([
    Post('chapters/:chapterId/lessons'),
    RequireCourseOwnership({ resource: 'chapter', param: 'chapterId' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('chapterId', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, CreateLessonDto]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "create", null);
__decorate([
    Get('chapters/:chapterId/lessons'),
    RequireCourseOwnership({ resource: 'chapter', param: 'chapterId' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('chapterId', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "list", null);
__decorate([
    Get('lessons/:id'),
    RequireCourseOwnership({ resource: 'lesson', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "get", null);
__decorate([
    Patch('lessons/:id'),
    RequireCourseOwnership({ resource: 'lesson', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    __param(0, Param('id', uuid())),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateLessonDto]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "update", null);
__decorate([
    Delete('lessons/:id'),
    RequireCourseOwnership({ resource: 'lesson', param: 'id' }),
    Header('Cache-Control', 'no-store'),
    HttpCode(204),
    __param(0, Param('id', uuid())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LessonsController.prototype, "remove", null);
LessonsController = __decorate([
    Controller(),
    UseGuards(OriginGuard, SessionGuard, CourseOwnershipGuard),
    Roles('instructor', 'admin'),
    __metadata("design:paramtypes", [LessonsService])
], LessonsController);
export { LessonsController };
//# sourceMappingURL=lessons.controller.js.map