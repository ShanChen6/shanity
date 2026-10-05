import { Module } from '@nestjs/common';
import { OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CourseOwnershipGuard } from './course-ownership.guard.js';
import { ChaptersController } from './chapters.controller.js';
import { ChaptersService } from './chapters.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ChaptersController],
  providers: [
    ChaptersService,
    OriginGuard,
    SessionGuard,
    CourseOwnershipGuard,
  ],
})
export class ChaptersModule {}