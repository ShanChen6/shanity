var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { InstructorContentController, CourseMediaController, } from './instructor-content.controller.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { CourseOwnershipGuard } from './course-ownership.guard.js';
import { CoursesController } from './courses.controller.js';
import { PublicCoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { CoursePublishabilityValidator } from './course-publishability.validator.js';
let CoursesModule = class CoursesModule {
};
CoursesModule = __decorate([
    Module({
        imports: [AuthModule, DatabaseModule],
        controllers: [
            CoursesController,
            PublicCoursesController,
            InstructorContentController,
            CourseMediaController,
        ],
        providers: [
            CoursesService,
            CoursePublishabilityValidator,
            OriginGuard,
            SessionGuard,
            CourseOwnershipGuard,
        ],
    })
], CoursesModule);
export { CoursesModule };
//# sourceMappingURL=courses.module.js.map