import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OriginGuard, SessionGuard } from '../auth/auth.guards.js';
import { CoursesController } from './courses.controller.js';
import { CoursesService } from './courses.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [CoursesController],
  providers: [CoursesService, OriginGuard, SessionGuard],
})
export class CoursesModule {}