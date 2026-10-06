var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { CourseOwnershipService } from '../../../courses/course-ownership.service.js';
import { QuizEntity, QuizScope } from '../entities/quiz.entity.js';
import { QuizCourseResolverService, QuizTargetNotFoundError, } from '../services/quiz-course-resolver.service.js';
const forbiddenBody = (code) => ({
    statusCode: 403,
    message: code,
    code,
});
export const QUIZ_FORBIDDEN = forbiddenBody('QUIZ_FORBIDDEN');
export const TARGET_COURSE_FORBIDDEN = forbiddenBody('TARGET_COURSE_FORBIDDEN');
export const FORBIDDEN_RESOURCE = forbiddenBody('FORBIDDEN_RESOURCE');
const AUTHORING_ROLES = ['instructor', 'admin'];
let QuizAuthorizationGuard = class QuizAuthorizationGuard {
    dataSource;
    resolver;
    ownership;
    constructor(dataSource, resolver, ownership) {
        this.dataSource = dataSource;
        this.resolver = resolver;
        this.ownership = ownership;
    }
    async canActivate(context) {
        const request = context
            .switchToHttp()
            .getRequest();
        const principal = request.principal;
        if (!principal?.roles.some((role) => AUTHORING_ROLES.includes(role)))
            throw new ForbiddenException(FORBIDDEN_RESOURCE);
        const quizId = await this.quizIdFrom(request.params);
        const quiz = quizId
            ? await this.dataSource.getRepository(QuizEntity).findOne({
                where: { id: quizId },
                select: {
                    id: true,
                    scope: true,
                    targetId: true,
                    status: true,
                    createdBy: true,
                },
            })
            : null;
        if (!quiz)
            throw new ForbiddenException(QUIZ_FORBIDDEN);
        const decision = await this.decide(principal, quiz);
        if ('denied' in decision)
            throw new ForbiddenException(QUIZ_FORBIDDEN);
        request.quiz = decision.quiz;
        return true;
    }
    async authorize(principal, quiz) {
        const decision = await this.decide(principal, quiz);
        return 'quiz' in decision ? decision.quiz : null;
    }
    async decide(principal, quiz) {
        const isAdmin = principal.roles.includes('admin');
        if (quiz.scope === QuizScope.STANDALONE)
            return isAdmin || quiz.createdBy === principal.id
                ? { quiz: { ...quiz, courseId: null } }
                : { denied: true };
        let courseId;
        try {
            courseId = await this.resolver.resolveCourseIdByQuiz(quiz);
        }
        catch (error) {
            if (!(error instanceof QuizTargetNotFoundError))
                throw error;
            return isAdmin ? { quiz: { ...quiz, courseId: null } } : { denied: true };
        }
        return (await this.ownership.canManageCourse(principal, courseId))
            ? { quiz: { ...quiz, courseId } }
            : { denied: true };
    }
    async quizIdFrom(params) {
        const valid = (id) => id !== undefined && isUUID(id) ? id : null;
        const direct = params.quizId ?? params.id;
        if (direct !== undefined)
            return valid(direct);
        const questionId = valid(params.questionId);
        if (questionId) {
            const [row] = await this.dataSource.query('SELECT quiz_id AS "quizId" FROM quiz_questions WHERE id = $1', [questionId]);
            return row?.quizId ?? null;
        }
        const optionId = valid(params.optionId);
        if (optionId) {
            const [row] = await this.dataSource.query(`SELECT question.quiz_id AS "quizId"
         FROM quiz_options option
         INNER JOIN quiz_questions question ON question.id = option.question_id
         WHERE option.id = $1`, [optionId]);
            return row?.quizId ?? null;
        }
        return null;
    }
};
QuizAuthorizationGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        QuizCourseResolverService,
        CourseOwnershipService])
], QuizAuthorizationGuard);
export { QuizAuthorizationGuard };
//# sourceMappingURL=quiz-authorization.guard.js.map