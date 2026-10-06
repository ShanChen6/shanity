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
import { DatabaseService } from '../../../database/database.module.js';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { ProgressCache } from '../cache/progress-cache.js';
import { LessonProgressStatus } from '../entities/lesson-progress.entity.js';
export const progressPercentage = (completed, total) => total > 0 ? Math.min(100, Math.floor((completed * 100) / total)) : 100;
let CourseProgressCalculatorService = class CourseProgressCalculatorService {
    database;
    cache;
    curriculum;
    constructor(database, cache, curriculum) {
        this.database = database;
        this.cache = cache;
        this.curriculum = curriculum;
    }
    onModuleInit() {
        this.curriculum.onChanged(({ courseId }) => this.invalidateCourseProgressCache(courseId));
    }
    invalidateCourseProgressCache(courseId) {
        return this.cache.invalidateCourse(courseId);
    }
    invalidateStudentProgress(userId, courseId) {
        return this.cache.invalidateStudent(userId, courseId);
    }
    async calculate(userId, courseId) {
        const cached = await this.cache.get(userId, courseId);
        if (cached)
            return cached;
        const summary = await this.compute(userId, courseId);
        await this.cache.set(summary);
        return summary;
    }
    async compute(userId, courseId) {
        const [row] = (await this.database.dataSource.query(`${this.summarySelect('$3')}
       FROM enrollments enrollment
       INNER JOIN courses course ON course.id = enrollment.course_id
       LEFT JOIN lessons lesson
         ON lesson.course_id = course.id AND lesson.is_published = true
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = lesson.id
        AND progress.user_id = enrollment.user_id
        AND progress.course_id = course.id
       WHERE enrollment.user_id = $1 AND enrollment.course_id = $2
         AND enrollment.revoked_at IS NULL
       GROUP BY enrollment.user_id, enrollment.enrolled_at,
                enrollment.last_accessed_lesson_id,
                enrollment.last_accessed_at, course.id`, [userId, courseId, LessonProgressStatus.COMPLETED]));
        return this.toSummary(row ?? {
            courseId,
            userId,
            totalLessons: 0,
            totalRequiredLessons: 0,
            completedLessons: 0,
            completedRequiredLessons: 0,
            lastAccessedLessonId: null,
            updatedAt: new Date(0),
        });
    }
    async enrolledCourses(userId) {
        const rows = (await this.database.dataSource.query(`${this.summarySelect('$2')},
              course.title, course.slug, course.thumbnail,
              instructor.display_name AS "instructorName",
              resume_lesson.slug AS "lastAccessedLessonSlug",
              enrollment.last_accessed_at AS "lastAccessedAt"
       FROM enrollments enrollment
       INNER JOIN courses course ON course.id = enrollment.course_id
       LEFT JOIN users instructor
         ON instructor.id = COALESCE(course.instructor_id, course.owner_id)
       LEFT JOIN lessons lesson
         ON lesson.course_id = course.id AND lesson.is_published = true
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = lesson.id
        AND progress.user_id = enrollment.user_id
        AND progress.course_id = course.id
       LEFT JOIN lessons resume_lesson
         ON resume_lesson.id = enrollment.last_accessed_lesson_id
        AND resume_lesson.is_published = true
       WHERE enrollment.user_id = $1 AND enrollment.revoked_at IS NULL
       GROUP BY enrollment.user_id, enrollment.enrolled_at,
                enrollment.last_accessed_lesson_id,
                enrollment.last_accessed_at, course.id,
                instructor.display_name, resume_lesson.slug
       ORDER BY enrollment.last_accessed_at DESC NULLS LAST,
                enrollment.enrolled_at DESC`, [userId, LessonProgressStatus.COMPLETED]));
        return rows.map((row) => {
            const summary = this.toSummary(row);
            return {
                courseId: row.courseId,
                title: row.title,
                slug: row.slug,
                thumbnailUrl: row.thumbnail,
                instructorName: row.instructorName,
                progress: {
                    percentage: summary.percentage,
                    completedRequiredLessons: summary.completedRequiredLessons,
                    totalRequiredLessons: summary.totalRequiredLessons,
                    lastAccessedLessonSlug: row.lastAccessedLessonSlug,
                    lastAccessedAt: row.lastAccessedAt
                        ? new Date(row.lastAccessedAt)
                        : null,
                },
            };
        });
    }
    summarySelect(statusParameter) {
        return `SELECT course.id AS "courseId", enrollment.user_id AS "userId",
      COUNT(lesson.id)::int AS "totalLessons",
      COUNT(lesson.id) FILTER (WHERE lesson.is_required = true)::int AS "totalRequiredLessons",
      COUNT(progress.id) FILTER (WHERE progress.status = ${statusParameter})::int AS "completedLessons",
      COUNT(progress.id) FILTER (
        WHERE lesson.is_required = true AND progress.status = ${statusParameter}
      )::int AS "completedRequiredLessons",
      enrollment.last_accessed_lesson_id AS "lastAccessedLessonId",
      COALESCE(
        enrollment.last_accessed_at,
        MAX(GREATEST(progress.updated_at, progress.last_accessed_at)),
        enrollment.enrolled_at
      ) AS "updatedAt"`;
    }
    toSummary(row) {
        const totalLessons = Number(row.totalLessons);
        const totalRequiredLessons = Number(row.totalRequiredLessons);
        const completedLessons = Number(row.completedLessons);
        const completedRequiredLessons = Number(row.completedRequiredLessons);
        const percentage = progressPercentage(completedRequiredLessons, totalRequiredLessons);
        return {
            courseId: row.courseId,
            userId: row.userId,
            totalLessons,
            totalRequiredLessons,
            completedLessons,
            completedRequiredLessons,
            percentage,
            isCompleted: percentage === 100,
            ...(row.lastAccessedLessonId
                ? { lastAccessedLessonId: row.lastAccessedLessonId }
                : {}),
            updatedAt: new Date(row.updatedAt),
        };
    }
};
CourseProgressCalculatorService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService,
        ProgressCache,
        CurriculumEvents])
], CourseProgressCalculatorService);
export { CourseProgressCalculatorService };
//# sourceMappingURL=course-progress-calculator.service.js.map