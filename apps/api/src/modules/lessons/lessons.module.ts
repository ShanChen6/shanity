import { Module } from '@nestjs/common';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { AuthModule } from '../../auth/auth.module.js';
import { CourseOwnershipGuard } from '../../courses/course-ownership.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [LessonsController],
  providers: [LessonsService, OriginGuard, SessionGuard, CourseOwnershipGuard],
})
export class LessonsModule {}
