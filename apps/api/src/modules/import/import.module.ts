import { Module } from '@nestjs/common';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { AuthModule } from '../../auth/auth.module.js';
import { DatabaseModule } from '../../database/database.module.js';
import { LessonsModule } from '../lessons/lessons.module.js';
import { QuizModule } from '../quiz/quiz.module.js';
import { ContentImportController } from './import.controller.js';
import { ContentImportService } from './services/content-import.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, LessonsModule, QuizModule],
  controllers: [ContentImportController],
  providers: [ContentImportService, OriginGuard, SessionGuard],
})
export class ContentImportModule {}
