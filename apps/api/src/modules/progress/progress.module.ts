import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { DatabaseModule } from '../../database/database.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';
import { CoursesModule } from '../../courses/courses.module.js';
import { LessonAccessGuard } from '../lessons/guards/lesson-access.guard.js';

@Module({
  imports: [AuthModule, DatabaseModule, CoursesModule],
  controllers: [ProgressController],
  providers: [ProgressService, OriginGuard, SessionGuard, LessonAccessGuard],
  exports: [ProgressService],
})
export class ProgressModule {}
