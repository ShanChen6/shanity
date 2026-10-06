var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
import { LessonProgressStatus } from '../../progress/entities/lesson-progress.entity.js';
const ORDER_BY = {
    percentage_desc: `percentage DESC, "lastAccessedAt" DESC NULLS LAST`,
    percentage_asc: `percentage ASC, "lastAccessedAt" DESC NULLS LAST`,
    last_accessed_desc: `"lastAccessedAt" DESC NULLS LAST, percentage DESC`,
};
const likePattern = (search) => `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
let InstructorProgressService = class InstructorProgressService {
    database;
    constructor(database) {
        this.database = database;
    }
    scoredStudents() {
        return `
      WITH totals AS (
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE is_required)::int AS total_required
        FROM lessons WHERE course_id = $1 AND is_published = true
      ),
      per_student AS (
        SELECT enrollment.user_id, enrollment.enrolled_at,
          COUNT(lesson.id)::int AS touched,
          COUNT(lesson.id) FILTER (
            WHERE progress.status = '${LessonProgressStatus.COMPLETED}'
          )::int AS completed,
          COUNT(lesson.id) FILTER (
            WHERE progress.status = '${LessonProgressStatus.COMPLETED}'
              AND lesson.is_required
          )::int AS completed_required,
          COALESCE(
            enrollment.last_accessed_at,
            MAX(GREATEST(progress.updated_at, progress.last_accessed_at))
          ) AS last_accessed_at
        FROM enrollments enrollment
        LEFT JOIN lesson_progress progress
          ON progress.user_id = enrollment.user_id
         AND progress.course_id = enrollment.course_id
        LEFT JOIN lessons lesson
          ON lesson.id = progress.lesson_id AND lesson.is_published = true
        WHERE enrollment.course_id = $1 AND enrollment.revoked_at IS NULL
        GROUP BY enrollment.user_id, enrollment.enrolled_at,
                 enrollment.last_accessed_at
      ),
      scored AS (
        SELECT student.*, totals.total, totals.total_required,
          CASE WHEN totals.total_required = 0 THEN 100
               -- Integer division = floor, matching
               -- CourseProgressCalculatorService.progressPercentage.
               ELSE LEAST(100,
                 student.completed_required * 100 / totals.total_required)
          END AS percentage
        FROM per_student student CROSS JOIN totals
      ),
      classified AS (
        SELECT scored.*,
          CASE WHEN percentage >= 100 THEN 'COMPLETED'
               WHEN touched = 0 THEN 'NOT_STARTED'
               ELSE 'IN_PROGRESS'
          END AS status
        FROM scored
      )`;
    }
    async studentsProgress(course, query) {
        const { page, limit, sortBy, status } = query;
        const search = query.search ? likePattern(query.search) : null;
        const [rows, [summary]] = await Promise.all([
            this.database.dataSource.query(`${this.scoredStudents()}
        SELECT classified.user_id AS "studentId",
          users.display_name AS "fullName", users.email,
          users.avatar_key AS "avatarKey",
          classified.enrolled_at AS "enrolledAt",
          classified.last_accessed_at AS "lastAccessedAt",
          classified.total AS "totalLessons",
          classified.total_required AS "totalRequiredLessons",
          classified.completed AS "completedLessons",
          classified.completed_required AS "completedRequiredLessons",
          classified.percentage, classified.status,
          COUNT(*) OVER () AS "totalItems"
        FROM classified
        INNER JOIN users ON users.id = classified.user_id
        WHERE ($2::text IS NULL
               OR users.display_name ILIKE $2 OR users.email ILIKE $2)
          AND ($3::text = 'ALL' OR classified.status = $3)
        ORDER BY ${ORDER_BY[sortBy]}, classified.user_id
        LIMIT $4 OFFSET $5`, [course.id, search, status, limit, (page - 1) * limit]),
            this.database.dataSource.query(`${this.scoredStudents()}
        SELECT COUNT(*)::int AS "totalStudents",
          ROUND(AVG(percentage), 1) AS avg,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed
        FROM classified`, [course.id]),
        ]);
        const totalItems = Number(rows[0]?.totalItems ?? 0);
        const totalStudents = summary?.totalStudents ?? 0;
        const completedStudents = summary?.completed ?? 0;
        return {
            course: {
                id: course.id,
                title: course.title,
                totalStudents,
                avgProgressPercentage: Number(summary?.avg ?? 0),
                completedStudents,
                completionRate: totalStudents
                    ? Math.round((completedStudents / totalStudents) * 1000) / 10
                    : 0,
            },
            students: rows.map((row) => ({
                studentId: row.studentId,
                fullName: row.fullName,
                email: row.email,
                avatarUrl: row.avatarKey ? `/avatars/${row.avatarKey}` : null,
                enrolledAt: row.enrolledAt,
                lastAccessedAt: row.lastAccessedAt,
                status: row.status,
                progress: {
                    percentage: row.percentage,
                    completedLessons: row.completedLessons,
                    totalLessons: row.totalLessons,
                    completedRequiredLessons: row.completedRequiredLessons,
                    totalRequiredLessons: row.totalRequiredLessons,
                },
            })),
            pagination: {
                page,
                limit,
                totalItems,
                totalPages: Math.ceil(totalItems / limit),
            },
        };
    }
    async studentLessons(course, studentId) {
        const [student] = await this.database.dataSource.query(`SELECT users.display_name AS "fullName", users.email
       FROM enrollments enrollment
       INNER JOIN users ON users.id = enrollment.user_id
       WHERE enrollment.course_id = $1 AND enrollment.user_id = $2
         AND enrollment.revoked_at IS NULL`, [course.id, studentId]);
        if (!student)
            throw new NotFoundException('Student not found');
        const lessons = await this.database.dataSource.query(`SELECT lesson.id AS "lessonId", lesson.title,
        chapter.title AS "chapterTitle", lesson.is_required AS "isRequired",
        COALESCE(progress.status::text, 'NOT_STARTED') AS status,
        progress.completed_at AS "completedAt"
       FROM lessons lesson
       INNER JOIN chapters chapter ON chapter.id = lesson.chapter_id
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = lesson.id AND progress.user_id = $2
       WHERE lesson.course_id = $1 AND lesson.is_published = true
       ORDER BY chapter.position, chapter.id, lesson.position, lesson.id`, [course.id, studentId]);
        return { studentId, ...student, lessons };
    }
};
InstructorProgressService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService])
], InstructorProgressService);
export { InstructorProgressService };
//# sourceMappingURL=instructor-progress.service.js.map