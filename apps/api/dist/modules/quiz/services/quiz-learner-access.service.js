var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CourseAccessService } from '../../../courses/course-access.service.js';
import { rejectLessonAccess } from '../../lessons/guards/lesson-access.guard.js';
import { QuizEntity, QuizScope, QuizStatus } from '../entities/quiz.entity.js';
import { QuizAuthorizationGuard } from '../guards/quiz-authorization.guard.js';
import { QuizCourseResolverService, QuizTargetNotFoundError, } from './quiz-course-resolver.service.js';
export const QUIZ_NOT_FOUND = {
    statusCode: 404,
    message: 'QUIZ_NOT_FOUND',
    code: 'QUIZ_NOT_FOUND',
};
export const quizForbidden = (code, extra = {}) => new ForbiddenException({ statusCode: 403, message: code, code, ...extra });
export const QUIZ_FORBIDDEN = 'QUIZ_FORBIDDEN';
export const TARGET_COURSE_FORBIDDEN = 'TARGET_COURSE_FORBIDDEN';
let QuizLearnerAccessService = class QuizLearnerAccessService {
    dataSource;
    resolver;
    authorization;
    courseAccess;
    constructor(dataSource, resolver, authorization, courseAccess) {
        this.dataSource = dataSource;
        this.resolver = resolver;
        this.authorization = authorization;
        this.courseAccess = courseAccess;
    }
    async loadQuiz(quizId, manager) {
        const quiz = await (manager ?? this.dataSource.manager)
            .getRepository(QuizEntity)
            .findOneBy({ id: quizId });
        if (!quiz)
            throw quizForbidden(QUIZ_FORBIDDEN);
        return quiz;
    }
    async loadPublishedQuiz(quizId, manager, lock = false) {
        const quiz = await (manager ?? this.dataSource.manager)
            .getRepository(QuizEntity)
            .findOne({
            where: { id: quizId },
            ...(lock && { lock: { mode: 'pessimistic_read' } }),
        });
        if (!quiz || quiz.status !== QuizStatus.PUBLISHED)
            throw quizForbidden(QUIZ_FORBIDDEN);
        return quiz;
    }
    async assertCanTake(principal, quiz) {
        if (await this.authorization.authorize(principal, quiz))
            return;
        if (quiz.scope === QuizScope.STANDALONE)
            return;
        if (quiz.scope === QuizScope.LESSON) {
            const access = await this.courseAccess.canAccessLesson(principal.id, quiz.targetId, { allowPreview: false });
            if (access.granted)
                return;
            if (access.reason === 'PREREQUISITE_LESSON_NOT_COMPLETED')
                rejectLessonAccess(access);
            throw targetForbidden(access.reason === 'ENROLLMENT_SUSPENDED'
                ? 'ENROLLMENT_SUSPENDED'
                : access.reason === 'ENROLLMENT_REQUIRED'
                    ? 'ENROLLMENT_REQUIRED'
                    : 'TARGET_UNAVAILABLE');
        }
        let courseId;
        try {
            courseId = await this.resolver.resolveCourseIdByQuiz(quiz);
        }
        catch (error) {
            if (error instanceof QuizTargetNotFoundError)
                throw targetForbidden('TARGET_UNAVAILABLE');
            throw error;
        }
        const [course] = await this.dataSource.query(`SELECT course.status,
         enrollment.user_id IS NOT NULL AS enrolled,
         enrollment.revoked_at IS NOT NULL AS revoked
       FROM courses course
       LEFT JOIN enrollments enrollment
         ON enrollment.course_id = course.id AND enrollment.user_id = $2
       WHERE course.id = $1`, [courseId, principal.id]);
        if (!course || course.status !== 'published')
            throw targetForbidden('TARGET_UNAVAILABLE');
        if (!course.enrolled)
            throw targetForbidden('ENROLLMENT_REQUIRED');
        if (course.revoked)
            throw targetForbidden('ENROLLMENT_SUSPENDED');
    }
};
QuizLearnerAccessService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        QuizCourseResolverService,
        QuizAuthorizationGuard,
        CourseAccessService])
], QuizLearnerAccessService);
export { QuizLearnerAccessService };
const targetForbidden = (reason) => quizForbidden(TARGET_COURSE_FORBIDDEN, { reason });
//# sourceMappingURL=quiz-learner-access.service.js.map