import {
  InstructorContentController,
  CourseMediaController,
} from './instructor-content.controller.js';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { CourseOwnershipGuard } from './course-ownership.guard.js';
import { CoursesController } from './courses.controller.js';
import { PublicCoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { CoursePublishabilityValidator } from './course-publishability.validator.js';
import { CourseAccessService } from './course-access.service.js';
import { LessonsModule } from '../modules/lessons/lessons.module.js';

@Module({
  imports: [AuthModule, DatabaseModule, LessonsModule],
  controllers: [
    CoursesController,
    PublicCoursesController,
    InstructorContentController,
    CourseMediaController,
  ],
  providers: [
    CoursesService,
    CourseAccessService,
    CoursePublishabilityValidator,
    OriginGuard,
    SessionGuard,
    CourseOwnershipGuard,
  ],
  exports: [CourseAccessService],
})
export class CoursesModule {}
