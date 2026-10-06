var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { QuizScope } from '../entities/quiz.entity.js';
export class QuizTargetNotFoundError extends Error {
    scope;
    targetId;
    constructor(scope, targetId) {
        super(`Quiz ${String(scope).toLowerCase()} target not found`);
        this.scope = scope;
        this.targetId = targetId;
        this.name = 'QuizTargetNotFoundError';
    }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TARGET_COURSE_SQL = {
    [QuizScope.LESSON]: `SELECT chapter.course_id AS "courseId"
    FROM lessons lesson
    INNER JOIN chapters chapter ON chapter.id = lesson.chapter_id
    WHERE lesson.id = $1`,
    [QuizScope.CHAPTER]: `SELECT course_id AS "courseId"
    FROM chapters WHERE id = $1`,
    [QuizScope.COURSE]: `SELECT id AS "courseId" FROM courses WHERE id = $1`,
};
let QuizCourseResolverService = class QuizCourseResolverService {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async resolveCourseIdByQuiz(quiz, manager) {
        if (quiz.scope === QuizScope.STANDALONE)
            return null;
        if (quiz.scope === QuizScope.COURSE && quiz.targetId)
            return quiz.targetId;
        const courseId = await this.findTargetCourseId(quiz, manager);
        if (!courseId)
            throw new QuizTargetNotFoundError(quiz.scope, quiz.targetId);
        return courseId;
    }
    async findTargetCourseId({ scope, targetId }, manager = this.dataSource.manager) {
        const sql = TARGET_COURSE_SQL[scope];
        if (!sql || !targetId || !UUID.test(targetId))
            return null;
        const [row] = await manager.query(sql, [
            targetId,
        ]);
        return row?.courseId ?? null;
    }
};
QuizCourseResolverService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DataSource])
], QuizCourseResolverService);
export { QuizCourseResolverService };
//# sourceMappingURL=quiz-course-resolver.service.js.map