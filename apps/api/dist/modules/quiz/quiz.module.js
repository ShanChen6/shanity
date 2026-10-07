var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { CourseAccessService } from '../../courses/course-access.service.js';
import { CourseEnrollmentGuard } from '../../courses/course-enrollment.guard.js';
import { CourseOwnershipService } from '../../courses/course-ownership.service.js';
import { DatabaseModule } from '../../database/database.module.js';
import { ProgressModule } from '../progress/progress.module.js';
import { QuizAttemptsController } from './controllers/quiz-attempts.controller.js';
import { QuizAuthoringController } from './controllers/quiz-authoring.controller.js';
import { QuizQuestionAuthoringController } from './controllers/quiz-question-authoring.controller.js';
import { QuizStudentReadController } from './controllers/quiz-student-read.controller.js';
import { AdminQuizQuestionsController, QuizTakeController, } from './controllers/quiz-questions.controller.js';
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
let QuizModule = class QuizModule {
};
QuizModule = __decorate([
    Module({
        imports: [AuthModule, DatabaseModule, ProgressModule],
        controllers: [
            QuizStudentReadController,
            QuizTakeController,
            AdminQuizQuestionsController,
            QuizAttemptsController,
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
            QuizCourseResolverService,
            QuizTargetValidationService,
            QuizAuthorizationGuard,
            QuizQuestionAuthoringService,
        ],
    })
], QuizModule);
export { QuizModule };
//# sourceMappingURL=quiz.module.js.map