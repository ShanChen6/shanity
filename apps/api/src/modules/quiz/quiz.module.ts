import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { CourseAccessService } from '../../courses/course-access.service.js';
import { CourseEnrollmentGuard } from '../../courses/course-enrollment.guard.js';
import { CourseOwnershipService } from '../../courses/course-ownership.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { InstructorGradingController } from './controllers/instructor-grading.controller.js';
import { InstructorGradingQueueService } from './services/instructor-grading-queue.service.js';
import { QuizGradingController } from './controllers/quiz-grading.controller.js';
import { QuizGradingService } from './services/quiz-grading.service.js';
import { QuizAttemptsController } from './controllers/quiz-attempts.controller.js';
import { QuizAuthoringController } from './controllers/quiz-authoring.controller.js';
import { QuizQuestionAuthoringController } from './controllers/quiz-question-authoring.controller.js';
import { QuizStudentReadController } from './controllers/quiz-student-read.controller.js';
import {
  AdminQuizQuestionsController,
  QuizTakeController,
} from './controllers/quiz-questions.controller.js';
import { QuizAuthorizationGuard } from './guards/quiz-authorization.guard.js';
import { QuizAttemptsService } from './services/quiz-attempts.service.js';
import { QuizAuthoringService } from './services/quiz-authoring.service.js';
import { QuizCourseResolverService } from './services/quiz-course-resolver.service.js';
import { QuizQuestionAuthoringService } from './services/quiz-question-authoring.service.js';
import { QuizLearnerAccessService } from './services/quiz-learner-access.service.js';
import { QuizQuestionsService } from './services/quiz-questions.service.js';
import { QuizStudentReadService } from './services/quiz-student-read.service.js';
import { QuizPublishValidationPipeline } from './services/quiz-publish-validation.pipeline.js';
import { QuizPublishingService } from './services/quiz-publishing.service.js';
import { QuizTargetValidationService } from './services/quiz-target-validation.service.js';

@Module({
  imports: [AuthModule, DatabaseModule, ProgressModule],
  controllers: [
    // First: `quizzes/standalone/...` must win over `quizzes/:id/...`.
    QuizStudentReadController,
    QuizTakeController,
    AdminQuizQuestionsController,
    QuizAttemptsController,
    InstructorGradingController,
    QuizGradingController,
    QuizAuthoringController,
    QuizQuestionAuthoringController,
  ],
  providers: [
    QuizCourseResolverService,
    QuizTargetValidationService,
    QuizAuthorizationGuard,
    QuizLearnerAccessService,
    QuizQuestionsService,
    QuizStudentReadService,
    QuizAttemptsService,
    InstructorGradingQueueService,
    QuizGradingService,
    QuizAuthoringService,
    QuizQuestionAuthoringService,
    QuizPublishValidationPipeline,
    QuizPublishingService,
    CourseAccessService,
    CourseOwnershipService,
    CourseEnrollmentGuard,
    OriginGuard,
    SessionGuard,
  ],
  exports: [
    QuizAuthoringService,
    QuizCourseResolverService,
    QuizTargetValidationService,
    QuizAuthorizationGuard,
    QuizQuestionAuthoringService,
  ],
})
export class QuizModule {}
