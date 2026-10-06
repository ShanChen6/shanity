import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { SessionGuard } from '../../auth/auth.guards.js';
import { CourseAccessService } from '../../courses/course-access.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import {
  AdminQuizQuestionsController,
  QuizTakeController,
} from './controllers/quiz-questions.controller.js';
import { QuizAuthorizationGuard } from './guards/quiz-authorization.guard.js';
import { QuizCourseResolverService } from './services/quiz-course-resolver.service.js';
import { QuizQuestionsService } from './services/quiz-questions.service.js';
import { QuizTargetValidationService } from './services/quiz-target-validation.service.js';

@Module({
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
export class QuizModule {}
