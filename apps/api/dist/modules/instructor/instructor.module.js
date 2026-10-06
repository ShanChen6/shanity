var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SessionGuard } from '../../auth/auth.guards.js';
import { DatabaseModule } from '../../database/database.module.js';
import { InstructorCourseController } from './controllers/instructor-course.controller.js';
import { CourseOwnerGuard } from './guards/course-owner.guard.js';
import { InstructorProgressService } from './services/instructor-progress.service.js';
let InstructorModule = class InstructorModule {
};
InstructorModule = __decorate([
    Module({
        imports: [AuthModule, DatabaseModule],
        controllers: [InstructorCourseController],
        providers: [InstructorProgressService, CourseOwnerGuard, SessionGuard],
    })
], InstructorModule);
export { InstructorModule };
//# sourceMappingURL=instructor.module.js.map