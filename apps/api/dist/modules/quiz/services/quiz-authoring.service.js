var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../../../users/user.entity.js';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { GradingPolicy, QuizEntity, QuizScope, QuizStatus, ReviewPolicy, } from '../entities/quiz.entity.js';
import { CourseOwnershipService, managesCourseSql, } from '../../../courses/course-ownership.service.js';
import { TARGET_COURSE_FORBIDDEN } from '../guards/quiz-authorization.guard.js';
import { QUIZ_COURSE_ID, QUIZ_COURSE_JOINS, } from './quiz-course-resolver.service.js';
import { QUIZ_NOT_FOUND } from './quiz-learner-access.service.js';
import { QuizQuestionsService } from './quiz-questions.service.js';
import { QuizTargetValidationService, rethrowQuizTargetViolation, } from './quiz-target-validation.service.js';
const error = (code) => ({ message: code, code });
export const quizNotEditable = () => new ConflictException({
    statusCode: 409,
    message: 'Only DRAFT quizzes are edited in place; open a new version first',
    code: 'QUIZ_NOT_EDITABLE',
});
function toQuizConfig(quiz) {
    return {
        id: quiz.id,
        title: quiz.title,
        slug: quiz.slug,
        description: quiz.description,
        scope: quiz.scope,
        targetId: quiz.targetId,
        status: quiz.status,
        version: quiz.version,
        passingScore: quiz.passingScore,
        maxAttempts: quiz.maxAttempts,
        durationMinutes: quiz.durationMinutes,
        isRequired: quiz.isRequired,
        reviewPolicy: quiz.reviewPolicy,
        gradingPolicy: quiz.gradingPolicy,
        shuffleQuestions: quiz.shuffleQuestions,
        shuffleOptions: quiz.shuffleOptions,
        difficulty: quiz.difficulty,
        tags: quiz.tags,
        createdBy: quiz.createdBy,
        publishedAt: quiz.publishedAt,
        createdAt: quiz.createdAt,
        updatedAt: quiz.updatedAt,
    };
}
function assertRequiredFitsScope(scope, isRequired) {
    if (scope === QuizScope.STANDALONE && isRequired)
        throw new BadRequestException({
            statusCode: 400,
            ...error('STANDALONE_QUIZ_CANNOT_BE_REQUIRED'),
        });
}
function rethrowWriteError(reason) {
    const { code, constraint } = (reason ?? {});
    if (code === '23505' && constraint === 'UQ_quizzes_slug')
        throw new ConflictException({
            statusCode: 409,
            ...error('QUIZ_SLUG_TAKEN'),
        });
    rethrowQuizTargetViolation(reason);
}
let QuizAuthoringService = class QuizAuthoringService {
    dataSource;
    validation;
    ownership;
    questions;
    curriculum;
    constructor(dataSource, validation, ownership, questions, curriculum) {
        this.dataSource = dataSource;
        this.validation = validation;
        this.ownership = ownership;
        this.questions = questions;
        this.curriculum = curriculum;
    }
    async create(principal, dto) {
        const created = await this.dataSource
            .transaction(async (manager) => {
            const target = await this.validation.validate(dto.scope, dto.targetId, manager);
            if (target.scope !== QuizScope.STANDALONE &&
                !(await this.ownership.canManageCourse(principal, target.courseId)))
                throw new ForbiddenException(TARGET_COURSE_FORBIDDEN);
            const isRequired = dto.isRequired ?? false;
            assertRequiredFitsScope(target.scope, isRequired);
            const quizzes = manager.getRepository(QuizEntity);
            const quiz = quizzes.create({
                status: QuizStatus.DRAFT,
                version: 1,
                createdBy: principal.id,
                scope: target.scope,
                targetId: target.targetId,
                title: dto.title,
                slug: dto.slug ?? null,
                description: dto.description ?? null,
                passingScore: dto.passingScore ?? 80,
                maxAttempts: dto.maxAttempts ?? null,
                durationMinutes: dto.durationMinutes ?? null,
                isRequired,
                reviewPolicy: dto.reviewPolicy ?? ReviewPolicy.AFTER_SUBMIT,
                gradingPolicy: dto.gradingPolicy ?? GradingPolicy.HIGHEST,
                shuffleQuestions: dto.shuffleQuestions ?? true,
                shuffleOptions: dto.shuffleOptions ?? true,
                difficulty: dto.difficulty ?? null,
                tags: dto.tags ?? [],
            });
            const { identifiers } = await quizzes.insert(quiz);
            return { id: identifiers[0].id, courseId: target.courseId };
        })
            .catch(rethrowWriteError);
        return this.detail(created.id, created.courseId);
    }
    async list(principal, query) {
        const { page, limit } = query;
        const rows = await this.dataSource.query(`SELECT quiz.id, quiz.title, quiz.slug, quiz.scope,
         quiz.target_id AS "targetId", scoped.course_id AS "courseId",
         quiz.status, quiz.version, quiz.is_required AS "isRequired",
         (SELECT count(*)::int FROM quiz_questions question
          WHERE question.quiz_id = quiz.id) AS "questionCount",
         quiz.created_by AS "createdBy", quiz.created_at AS "createdAt",
         quiz.updated_at AS "updatedAt",
         COUNT(*) OVER () AS "totalItems"
       FROM quizzes quiz
       ${QUIZ_COURSE_JOINS}
       CROSS JOIN LATERAL (SELECT ${QUIZ_COURSE_ID} AS course_id) scoped
       LEFT JOIN courses course ON course.id = scoped.course_id
       WHERE ($1::boolean
           OR (quiz.scope = 'STANDALONE' AND quiz.created_by = $2)
           OR (course.id IS NOT NULL AND ${managesCourseSql('$2')}))
         AND ($3::"QuizScope" IS NULL OR quiz.scope = $3)
         AND (CASE WHEN $4::"QuizStatus" IS NULL
               THEN quiz.status <> 'ARCHIVED' ELSE quiz.status = $4 END)
         AND ($5::text IS NULL
           OR position(lower($5) IN lower(quiz.title)) > 0
           OR position(lower($5) IN lower(coalesce(quiz.slug, ''))) > 0)
         AND ($6::uuid IS NULL OR scoped.course_id = $6)
       ORDER BY quiz.updated_at DESC, quiz.id
       LIMIT $7 OFFSET $8`, [
            principal.roles.includes('admin'),
            principal.id,
            query.scope ?? null,
            query.status ?? null,
            query.search || null,
            query.courseId ?? null,
            limit,
            (page - 1) * limit,
        ]);
        const totalItems = Number(rows[0]?.totalItems ?? 0);
        return {
            quizzes: rows.map(({ totalItems: _total, ...quiz }) => quiz),
            pagination: {
                page,
                limit,
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
            },
        };
    }
    async detail(quizId, courseId) {
        const quiz = await this.dataSource
            .getRepository(QuizEntity)
            .findOneBy({ id: quizId });
        if (!quiz)
            throw new NotFoundException(QUIZ_NOT_FOUND);
        const [author, [{ attemptCount }], questions] = await Promise.all([
            this.dataSource.getRepository(User).findOne({
                where: { id: quiz.createdBy },
                select: { id: true, displayName: true },
            }),
            this.dataSource.query('SELECT count(*)::int AS "attemptCount" FROM quiz_attempts WHERE quiz_id = $1', [quizId]),
            this.questions.listForInstructor(quizId),
        ]);
        return {
            ...toQuizConfig(quiz),
            courseId,
            author: author
                ? { id: author.id, displayName: author.displayName }
                : null,
            attemptCount,
            questions,
        };
    }
    async update(quizId, courseId, dto) {
        await this.dataSource
            .transaction(async (manager) => {
            const quiz = await this.lockQuiz(manager, quizId);
            if (quiz.status !== QuizStatus.DRAFT)
                throw quizNotEditable();
            assertRequiredFitsScope(quiz.scope, dto.isRequired ?? quiz.isRequired);
            const changes = {};
            if (dto.title !== undefined)
                changes.title = dto.title;
            if (dto.slug !== undefined)
                changes.slug = dto.slug;
            if (dto.description !== undefined)
                changes.description = dto.description;
            if (dto.passingScore !== undefined)
                changes.passingScore = dto.passingScore;
            if (dto.maxAttempts !== undefined)
                changes.maxAttempts = dto.maxAttempts;
            if (dto.durationMinutes !== undefined)
                changes.durationMinutes = dto.durationMinutes;
            if (dto.isRequired !== undefined)
                changes.isRequired = dto.isRequired;
            if (dto.reviewPolicy !== undefined)
                changes.reviewPolicy = dto.reviewPolicy;
            if (dto.gradingPolicy !== undefined)
                changes.gradingPolicy = dto.gradingPolicy;
            if (dto.shuffleQuestions !== undefined)
                changes.shuffleQuestions = dto.shuffleQuestions;
            if (dto.shuffleOptions !== undefined)
                changes.shuffleOptions = dto.shuffleOptions;
            if (dto.difficulty !== undefined)
                changes.difficulty = dto.difficulty;
            if (dto.tags !== undefined)
                changes.tags = dto.tags;
            if (!Object.keys(changes).length)
                return;
            await manager
                .getRepository(QuizEntity)
                .update(quizId, { ...changes, updatedAt: () => 'now()' });
        })
            .catch(rethrowWriteError);
        return this.detail(quizId, courseId);
    }
    async remove(quizId, courseId) {
        let unpublished = false;
        const result = await this.dataSource.transaction(async (manager) => {
            const quiz = await this.lockQuiz(manager, quizId);
            unpublished = quiz.status === QuizStatus.PUBLISHED;
            const [{ attempts }] = await manager.query('SELECT count(*)::int AS attempts FROM quiz_attempts WHERE quiz_id = $1', [quizId]);
            if (quiz.status === QuizStatus.DRAFT && attempts === 0) {
                await manager.getRepository(QuizEntity).delete(quizId);
                return { id: quizId, outcome: 'DELETED', status: null };
            }
            if (quiz.status !== QuizStatus.ARCHIVED)
                await manager.getRepository(QuizEntity).update(quizId, {
                    status: QuizStatus.ARCHIVED,
                    updatedAt: () => 'now()',
                });
            return {
                id: quizId,
                outcome: 'ARCHIVED',
                status: QuizStatus.ARCHIVED,
            };
        });
        if (unpublished && courseId)
            this.curriculum.emitChanged({
                courseId,
                source: 'DELETE /admin/quizzes/:id',
            });
        return result;
    }
    async lockQuiz(manager, quizId) {
        const quiz = await manager.getRepository(QuizEntity).findOne({
            where: { id: quizId },
            lock: { mode: 'pessimistic_write' },
        });
        if (!quiz)
            throw new NotFoundException(QUIZ_NOT_FOUND);
        return quiz;
    }
};
QuizAuthoringService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource,
        QuizTargetValidationService,
        CourseOwnershipService,
        QuizQuestionsService,
        CurriculumEvents])
], QuizAuthoringService);
export { QuizAuthoringService };
//# sourceMappingURL=quiz-authoring.service.js.map