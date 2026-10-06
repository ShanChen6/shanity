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
import { DatabaseService } from '../../../database/database.module.js';
import { CourseProgressCalculatorService } from './course-progress-calculator.service.js';
import { EnrollmentPolicy } from './enrollment-policy.js';
let ResumeLearningService = class ResumeLearningService {
    database;
    progressCalculator;
    enrollments;
    constructor(database, progressCalculator, enrollments) {
        this.database = database;
        this.progressCalculator = progressCalculator;
        this.enrollments = enrollments;
    }
    async course(userId, courseId) {
        await this.enrollments.requireActive(userId, courseId);
        const row = await this.resolve(userId, courseId);
        if (!row)
            throw new ForbiddenException('Active enrollment required');
        return {
            lessonSlug: row.lessonSlug,
            lessonTitle: row.lessonTitle,
            lastPosition: Number(row.lastPosition ?? 0),
            hasStarted: row.hasStarted,
        };
    }
    async latest(userId) {
        const [latest] = (await this.database.dataSource.query(`SELECT course_id AS "courseId"
       FROM enrollments
       WHERE user_id = $1 AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1 FROM lessons
           WHERE lessons.course_id = enrollments.course_id
             AND lessons.is_published = true
         )
       ORDER BY last_accessed_at DESC NULLS LAST, enrolled_at DESC
       LIMIT 1`, [userId]));
        if (!latest)
            return { hasActiveCourse: false };
        const row = await this.resolve(userId, latest.courseId);
        if (!row?.lessonId)
            return { hasActiveCourse: false };
        const progress = await this.progressCalculator.calculate(userId, row.courseId);
        return {
            hasActiveCourse: true,
            course: {
                id: row.courseId,
                title: row.courseTitle,
                slug: row.courseSlug,
            },
            resumeLesson: {
                id: row.lessonId,
                title: row.lessonTitle,
                slug: row.lessonSlug,
                lastPosition: Number(row.lastPosition ?? 0),
            },
            progressPercentage: progress.percentage,
        };
    }
    async resolve(userId, courseId) {
        const [row] = (await this.database.dataSource.query(`SELECT course.id AS "courseId", course.title AS "courseTitle",
              course.slug AS "courseSlug", candidate.id AS "lessonId",
              candidate.title AS "lessonTitle", candidate.slug AS "lessonSlug",
              COALESCE(progress.last_position, 0)::int AS "lastPosition",
              COALESCE(
                candidate.id = enrollment.last_accessed_lesson_id,
                false
              ) AS "hasStarted"
       FROM enrollments enrollment
       INNER JOIN courses course ON course.id = enrollment.course_id
       LEFT JOIN LATERAL (
         SELECT lesson.id, lesson.title, lesson.slug
         FROM lessons lesson
         INNER JOIN chapters chapter ON chapter.id = lesson.chapter_id
         LEFT JOIN lesson_progress candidate_progress
           ON candidate_progress.lesson_id = lesson.id
          AND candidate_progress.user_id = enrollment.user_id
         WHERE lesson.course_id = enrollment.course_id
           AND lesson.is_published = true
         ORDER BY
           CASE
             WHEN lesson.id = enrollment.last_accessed_lesson_id THEN 0
             WHEN candidate_progress.status IS NULL
               OR candidate_progress.status::text = 'IN_PROGRESS' THEN 1
             ELSE 2
           END,
           chapter.position,
           lesson.position
         LIMIT 1
       ) candidate ON true
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = candidate.id
        AND progress.user_id = enrollment.user_id
       WHERE enrollment.user_id = $1 AND enrollment.course_id = $2
         AND enrollment.revoked_at IS NULL`, [userId, courseId]));
        return row;
    }
};
ResumeLearningService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService,
        CourseProgressCalculatorService,
        EnrollmentPolicy])
], ResumeLearningService);
export { ResumeLearningService };
//# sourceMappingURL=resume-learning.service.js.map