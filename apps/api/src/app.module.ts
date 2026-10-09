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
import { PaymentModule } from './modules/payment/payment.module.js';
import { CommonModule } from './common/common.module.js';
import { CacheModule } from './cache/cache.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { BlogModule } from './modules/blog/blog.module.js';
import { LiveSessionModule } from './modules/live/live-session.module.js';

@Module({
  imports: [
    DatabaseModule,
    CurriculumEventsModule,
    CacheModule,
    AuthModule,
    CoursesModule,
    ChaptersModule,
    LessonsModule,
    ProgressModule,
    InstructorModule,
    QuizModule,
    ContentImportModule,
    PaymentModule,
    ChatModule,
    BlogModule,
    LiveSessionModule,
    CommonModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
