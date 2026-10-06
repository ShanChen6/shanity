var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
let AppModule = class AppModule {
};
AppModule = __decorate([
    Module({
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
        ],
        controllers: [AppController],
        providers: [AppService],
    })
], AppModule);
export { AppModule };
//# sourceMappingURL=app.module.js.map