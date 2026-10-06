var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { ForbiddenException, Injectable, NotFoundException, } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { QuizEntity, QuizScope } from '../entities/quiz.entity.js';
import { QuizCourseResolverService, QuizTargetNotFoundError, } from '../services/quiz-course-resolver.service.js';
export const QUIZ_FORBIDDEN = {
    statusCode: 403,
    message: 'QUIZ_FORBIDDEN',
    code: 'QUIZ_FORBIDDEN',
};
let QuizAuthorizationGuard = class QuizAuthorizationGuard {
    dataSource;
    resolver;
    constructor(dataSource, resolver) {
        this.dataSource = dataSource;
        this.resolver = resolver;
    }
    async canActivate(context) {
        const request = context
            .switchToHttp()
            .getRequest();
        const principal = request.principal;
        if (!principal)
            throw new ForbiddenException(QUIZ_FORBIDDEN);
        const isAdmin = principal.roles.includes('admin');
        const params = request.params;
        const quizId = params.quizId ?? params.id;
        const quiz = quizId && isUUID(quizId)
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
        if (!quiz) {
            if (isAdmin)
                throw new NotFoundException('Quiz not found');
            throw new ForbiddenException(QUIZ_FORBIDDEN);
        }
        const authorized = await this.authorize(principal, quiz);
        if (!authorized)
            throw new ForbiddenException(QUIZ_FORBIDDEN);
        request.quiz = authorized;
        return true;
    }
    async authorize(principal, quiz) {
        const isAdmin = principal.roles.includes('admin');
        if (quiz.scope === QuizScope.STANDALONE)
            return isAdmin || quiz.createdBy === principal.id
                ? { ...quiz, courseId: null }
                : null;
        let courseId;
        try {
            courseId = await this.resolver.resolveCourseIdByQuiz(quiz);
        }
        catch (error) {
            if (!(error instanceof QuizTargetNotFoundError))
                throw error;
            return isAdmin ? { ...quiz, courseId: null } : null;
        }
        if (isAdmin)
            return { ...quiz, courseId };
        if (!principal.roles.includes('instructor'))
            return null;
        return (await this.teachesCourse(principal.id, courseId))
            ? { ...quiz, courseId }
            : null;
    }
    async teachesCourse(userId, courseId) {
        if (!courseId)
            return false;
        const [row] = await this.dataSource.query(`SELECT EXISTS (
         SELECT 1 FROM courses course
         WHERE course.id = $1
           AND ($2 IN (course.owner_id, course.instructor_id)
             OR EXISTS (
               SELECT 1 FROM course_instructors assignment
               WHERE assignment.course_id = course.id
                 AND assignment.user_id = $2
             ))
       ) AS allowed`, [courseId, userId]);
        return row?.allowed === true;
    }
};
QuizAuthorizationGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        QuizCourseResolverService])
], QuizAuthorizationGuard);
export { QuizAuthorizationGuard };
//# sourceMappingURL=quiz-authorization.guard.js.map