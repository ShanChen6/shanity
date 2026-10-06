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
import { Controller, Get, Header, Param, ParseUUIDPipe, UseGuards, } from '@nestjs/common';
import { LessonAccessGuard } from './guards/lesson-access.guard.js';
import { LessonAccessService } from './lesson-access.service.js';
let LessonAccessController = class LessonAccessController {
    lessons;
    constructor(lessons) {
        this.lessons = lessons;
    }
    get(id) {
        return this.lessons.getAccessible(id);
    }
};
__decorate([
    Get(':id'),
    Header('Cache-Control', 'private, no-store'),
    __param(0, Param('id', new ParseUUIDPipe({ version: '4' }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], LessonAccessController.prototype, "get", null);
LessonAccessController = __decorate([
    Controller('lessons'),
    UseGuards(LessonAccessGuard),
    __metadata("design:paramtypes", [LessonAccessService])
], LessonAccessController);
export { LessonAccessController };
//# sourceMappingURL=lesson-access.controller.js.map