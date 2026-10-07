import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CoursesModule } from './courses/courses.module.js';
import { ChaptersModule } from './courses/chapters.module.js';
import { LessonsModule } from './modules/lessons/lessons.module.js';
import { ProgressModule } from './modules/progress/progress.module.js';
import { InstructorModule } from './modules/instructor/instructor.module.js';
import { CurriculumEventsModule } from './modules/curriculum/curriculum-events.module.js';
import { QuizModule } from './modules/quiz/quiz.module.js';
import { ContentImportModule } from './modules/import/import.module.js';

@Module({
  imports: [
    DatabaseModule,
    CurriculumEventsModule,
    AuthModule,
    CoursesModule,
    ChaptersModule,
    LessonsModule,
    ProgressModule,
    InstructorModule,
    QuizModule,
    ContentImportModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
