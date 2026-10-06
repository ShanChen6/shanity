import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { DatabaseModule } from '../../database/database.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';
import { CoursesModule } from '../../courses/courses.module.js';
import { LessonAccessGuard } from '../lessons/guards/lesson-access.guard.js';
import { CourseProgressCalculatorService } from './services/course-progress-calculator.service.js';
import { ResumeLearningService } from './services/resume-learning.service.js';
import { NoopProgressCache, ProgressCache } from './cache/progress-cache.js';
import { EnrollmentPolicy } from './services/enrollment-policy.js';

@Module({
  imports: [AuthModule, DatabaseModule, CoursesModule],
  controllers: [ProgressController],
  providers: [
    ProgressService,
    CourseProgressCalculatorService,
    ResumeLearningService,
    EnrollmentPolicy,
    // Swap for a Redis-backed adapter to enable caching.
    { provide: ProgressCache, useClass: NoopProgressCache },
    OriginGuard,
    SessionGuard,
    LessonAccessGuard,
  ],
  exports: [
    ProgressService,
    CourseProgressCalculatorService,
    ResumeLearningService,
  ],
})
export class ProgressModule {}
