import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { DatabaseModule } from '../../database/database.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';
import { CoursesModule } from '../../courses/courses.module.js';
import { LessonAccessGuard } from '../lessons/guards/lesson-access.guard.js';
import { CourseProgressEngine } from './services/course-progress-engine.service.js';
import { ResumeLearningService } from './services/resume-learning.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, CoursesModule],
  controllers: [ProgressController],
  providers: [
    ProgressService,
    CourseProgressEngine,
    ResumeLearningService,
    OriginGuard,
    SessionGuard,
    LessonAccessGuard,
  ],
  exports: [ProgressService, CourseProgressEngine, ResumeLearningService],
})
export class ProgressModule {}
