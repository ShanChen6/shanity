import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { QuizScope } from '../entities/quiz.entity.js';
import type { QuizEntity } from '../entities/quiz.entity.js';
export type QuizTarget = Pick<QuizEntity, 'scope' | 'targetId'>;
export declare class QuizTargetNotFoundError extends Error {
    readonly scope: QuizScope;
    readonly targetId: string | null;
    constructor(scope: QuizScope, targetId: string | null);
}
export declare const QUIZ_COURSE_JOINS = "\n  LEFT JOIN chapters target_chapter\n    ON quiz.scope = 'CHAPTER' AND target_chapter.id = quiz.target_id\n  LEFT JOIN lessons target_lesson\n    ON quiz.scope = 'LESSON' AND target_lesson.id = quiz.target_id\n  LEFT JOIN chapters target_lesson_chapter\n    ON target_lesson_chapter.id = target_lesson.chapter_id";
export declare const QUIZ_COURSE_ID = "CASE quiz.scope\n    WHEN 'COURSE' THEN quiz.target_id\n    WHEN 'CHAPTER' THEN target_chapter.course_id\n    WHEN 'LESSON' THEN target_lesson_chapter.course_id\n  END";
export declare const courseQuizzesSql: (courseIdSql: string) => string;
export declare class QuizCourseResolverService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    resolveCourseIdByQuiz(quiz: QuizTarget, manager?: EntityManager): Promise<string | null>;
    findTargetCourseId({ scope, targetId }: QuizTarget, manager?: EntityManager): Promise<string | null>;
}
