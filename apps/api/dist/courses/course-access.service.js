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
import { DatabaseService } from '../database/database.module.js';
let CourseAccessService = class CourseAccessService {
    database;
    constructor(database) {
        this.database = database;
    }
    async canAccessLesson(userId, lessonId, options = {}) {
        const [lesson] = await this.database.dataSource.query(`SELECT lesson.is_preview AS "isPreview",
        lesson.is_published AS "isPublished",
        course.status AS "courseStatus",
        COALESCE(course.instructor_id, course.owner_id) AS "instructorId",
        EXISTS (
          SELECT 1
          FROM enrollments enrollment
          WHERE enrollment.user_id = $2
            AND enrollment.course_id = lesson.course_id
            AND enrollment.revoked_at IS NULL
        ) AS "isEnrolled",
        EXISTS (
          SELECT 1
          FROM enrollments enrollment
          WHERE enrollment.user_id = $2
            AND enrollment.course_id = lesson.course_id
            AND enrollment.revoked_at IS NOT NULL
        ) AS "isSuspended",
        EXISTS (
          SELECT 1 FROM user_roles role
          WHERE role.user_id = $2 AND role.role_code = 'admin'
        ) AS "isAdmin",
        -- Sequential courses: the first published lesson before this one
        -- (chapter order, then lesson order) that is not done: a required
        -- lesson not completed, or any lesson whose required published quiz
        -- the user has not passed (reported as quizId once the lesson itself
        -- is done, so the learner is sent to the lesson first). Checking
        -- all earlier lessons, not only the previous one, keeps the lock
        -- correct after reordering or enabling sequential mode later.
        CASE WHEN course.is_sequential THEN (
          SELECT json_build_object(
            'id', earlier.id, 'title', earlier.title, 'slug', earlier.slug,
            'quizId', CASE WHEN lesson_done.done THEN pending_quiz.id END)
          FROM lessons earlier
          INNER JOIN chapters earlier_chapter
            ON earlier_chapter.id = earlier.chapter_id
          CROSS JOIN LATERAL (
            SELECT NOT earlier.is_required OR EXISTS (
              SELECT 1 FROM lesson_progress progress
              WHERE progress.lesson_id = earlier.id
                AND progress.user_id = $2
                AND progress.status = 'COMPLETED'
            ) AS done
          ) lesson_done
          LEFT JOIN LATERAL (
            SELECT quiz.id FROM quizzes quiz
            WHERE quiz.scope = 'LESSON' AND quiz.target_id = earlier.id
              AND quiz.status = 'PUBLISHED' AND quiz.is_required
              AND NOT EXISTS (
                SELECT 1 FROM quiz_attempts attempt
                WHERE attempt.quiz_id = quiz.id AND attempt.user_id = $2
                  AND attempt.status IN ('SUBMITTED', 'TIMED_OUT')
                  AND attempt.is_passed
              )
            ORDER BY quiz.created_at, quiz.id
            LIMIT 1
          ) pending_quiz ON true
          WHERE earlier_chapter.course_id = course.id
            AND earlier.is_published = true
            AND (earlier_chapter.position, earlier_chapter.id,
                 earlier.position, earlier.id)
              < (chapter.position, chapter.id, lesson.position, lesson.id)
            AND (NOT lesson_done.done OR pending_quiz.id IS NOT NULL)
          ORDER BY earlier_chapter.position, earlier_chapter.id,
                   earlier.position, earlier.id
          LIMIT 1
        ) END AS "requiredLesson"
      FROM lessons lesson
      INNER JOIN chapters chapter ON chapter.id = lesson.chapter_id
      INNER JOIN courses course ON course.id = chapter.course_id
      WHERE lesson.id = $1`, [lessonId, userId ?? null]);
        if (!lesson)
            return { granted: false, reason: 'LESSON_NOT_FOUND' };
        if (userId && (lesson.instructorId === userId || lesson.isAdmin))
            return { granted: true, bypass: true };
        if (lesson.courseStatus !== 'published')
            return { granted: false, reason: 'COURSE_UNAVAILABLE' };
        if (!lesson.isPublished)
            return { granted: false, reason: 'LESSON_UNPUBLISHED' };
        if (lesson.isEnrolled && lesson.requiredLesson && !lesson.isPreview)
            return {
                granted: false,
                reason: 'PREREQUISITE_LESSON_NOT_COMPLETED',
                requiredLesson: lesson.requiredLesson,
            };
        if (lesson.isEnrolled)
            return { granted: true };
        if (lesson.isPreview && options.allowPreview !== false)
            return { granted: true };
        if (!userId)
            return { granted: false, reason: 'AUTHENTICATION_REQUIRED' };
        if (lesson.isSuspended)
            return { granted: false, reason: 'ENROLLMENT_SUSPENDED' };
        return { granted: false, reason: 'ENROLLMENT_REQUIRED' };
    }
};
CourseAccessService = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [DatabaseService])
], CourseAccessService);
export { CourseAccessService };
//# sourceMappingURL=course-access.service.js.map