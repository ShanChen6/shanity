import { AuthModule } from './auth/auth.module.js';
import { DatabaseModule } from './database/database.module.js';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { CoursesModule } from './courses/courses.module.js';
import { ChaptersModule } from './courses/chapters.module.js';

@Module({
  imports: [DatabaseModule, AuthModule, CoursesModule, ChaptersModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
