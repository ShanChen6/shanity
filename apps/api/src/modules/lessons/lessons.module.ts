import { Module } from '@nestjs/common';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { StorageModule } from '../../storage/storage.module.js';
import { LessonOwnershipGuard } from './lesson-ownership.guard.js';
import { LessonRequestSanitizationInterceptor } from './lesson-request-sanitization.interceptor.js';
import { LessonsController } from './lessons.controller.js';
import { LessonsService } from './lessons.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, StorageModule],
  controllers: [LessonsController],
  providers: [
    LessonsService,
    OriginGuard,
    SessionGuard,
    LessonOwnershipGuard,
    LessonRequestSanitizationInterceptor,
  ],
  exports: [LessonsService],
})
export class LessonsModule {}
