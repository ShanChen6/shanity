var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SessionGuard } from '../../auth/auth.guards.js';
import { CourseAccessService } from '../../courses/course-access.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { AdminQuizQuestionsController, QuizTakeController, } from './controllers/quiz-questions.controller.js';
import { QuizAuthorizationGuard } from './guards/quiz-authorization.guard.js';
import { QuizCourseResolverService } from './services/quiz-course-resolver.service.js';
import { QuizQuestionsService } from './services/quiz-questions.service.js';
import { QuizTargetValidationService } from './services/quiz-target-validation.service.js';
let QuizModule = class QuizModule {
};
QuizModule = __decorate([
    Module({
        imports: [AuthModule, DatabaseModule],
        controllers: [QuizTakeController, AdminQuizQuestionsController],
        providers: [
            QuizCourseResolverService,
            QuizTargetValidationService,
            QuizAuthorizationGuard,
            QuizQuestionsService,
            CourseAccessService,
            SessionGuard,
        ],
        exports: [
            QuizCourseResolverService,
            QuizTargetValidationService,
            QuizAuthorizationGuard,
        ],
    })
], QuizModule);
export { QuizModule };
//# sourceMappingURL=quiz.module.js.map