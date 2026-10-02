import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { CourseOwnershipGuard } from './course-ownership.guard.js';
import { CoursesController } from './courses.controller.js';
import { PublicCoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';
import { CoursePublishabilityValidator } from './course-publishability.validator.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CoursesController, PublicCoursesController],
  providers: [
    CoursesService,
    CoursePublishabilityValidator,
    OriginGuard,
    SessionGuard,
    CourseOwnershipGuard,
  ],
})
export class CoursesModule {}