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
import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Req, UseGuards, } from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../auth/auth.guards.js';
import { CreateCourseDto } from './courses.dto.js';
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
    get(req, id) {
        return this.courses.get(req.principal, id);
    }
};
__decorate([
    Post(),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Body()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateCourseDto]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "create", null);
__decorate([
    Get(),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "list", null);
__decorate([
    Get(':id'),
    Header('Cache-Control', 'no-store'),
    __param(0, Req()),
    __param(1, Param('id', new ParseUUIDPipe())),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CoursesController.prototype, "get", null);
CoursesController = __decorate([
    Controller('courses'),
    UseGuards(OriginGuard, SessionGuard),
    Roles('instructor', 'admin'),
    __metadata("design:paramtypes", [CoursesService])
], CoursesController);
export { CoursesController };
//# sourceMappingURL=courses.controller.js.map