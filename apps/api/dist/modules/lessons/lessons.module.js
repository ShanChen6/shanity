var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { AuthModule } from '../../auth/auth.module.js';
import { CourseOwnershipGuard } from '../../courses/course-ownership.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';
let LessonsModule = class LessonsModule {
};
LessonsModule = __decorate([
    Module({
        imports: [AuthModule, DatabaseModule],
        controllers: [LessonsController],
        providers: [LessonsService, OriginGuard, SessionGuard, CourseOwnershipGuard],
    })
], LessonsModule);
export { LessonsModule };
//# sourceMappingURL=lessons.module.js.map