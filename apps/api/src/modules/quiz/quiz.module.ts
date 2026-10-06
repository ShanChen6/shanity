import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { CourseAccessService } from '../../courses/course-access.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { QuizAttemptsController } from './controllers/quiz-attempts.controller.js';
import {
  AdminQuizQuestionsController,
  QuizTakeController,
} from './controllers/quiz-questions.controller.js';
import { QuizAuthorizationGuard } from './guards/quiz-authorization.guard.js';
import { QuizAttemptsService } from './services/quiz-attempts.service.js';
import { QuizCourseResolverService } from './services/quiz-course-resolver.service.js';
import { QuizLearnerAccessService } from './services/quiz-learner-access.service.js';
import { QuizQuestionsService } from './services/quiz-questions.service.js';
import { QuizTargetValidationService } from './services/quiz-target-validation.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [
    QuizTakeController,
    AdminQuizQuestionsController,
    QuizAttemptsController,
  ],
  providers: [
    QuizCourseResolverService,
    QuizTargetValidationService,
    QuizAuthorizationGuard,
    QuizLearnerAccessService,
    QuizQuestionsService,
    QuizAttemptsService,
    CourseAccessService,
    OriginGuard,
    SessionGuard,
  ],
  exports: [
    QuizCourseResolverService,
    QuizTargetValidationService,
    QuizAuthorizationGuard,
  ],
})
export class QuizModule {}
