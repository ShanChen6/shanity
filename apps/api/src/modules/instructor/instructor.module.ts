import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SessionGuard } from '../../auth/auth.guards.js';
import { DatabaseModule } from '../../database/database.module.js';
import { InstructorCourseController } from './controllers/instructor-course.controller.js';
import { CourseOwnerGuard } from './guards/course-owner.guard.js';
import { InstructorProgressService } from './services/instructor-progress.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [InstructorCourseController],
  providers: [InstructorProgressService, CourseOwnerGuard, SessionGuard],
})
export class InstructorModule {}
