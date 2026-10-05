import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.module.js';

export type LessonAccessResult = {
  granted: boolean;
  bypass?: boolean;
  reason?:
    | 'LESSON_NOT_FOUND'
    | 'AUTHENTICATION_REQUIRED'
    | 'ENROLLMENT_REQUIRED'
    | 'COURSE_UNAVAILABLE'
    | 'LESSON_UNPUBLISHED';
};

interface LessonAccessRow {
  isPreview: boolean;
  isPublished: boolean;
  isEnrolled: boolean;
  courseStatus: string;
  instructorId: string | null;
  isAdmin: boolean;
}

@Injectable()
export class CourseAccessService {
  constructor(private readonly database: DatabaseService) {}

  async canAccessLesson(
    userId: string | undefined,
    lessonId: string,
    options: { allowPreview?: boolean } = {},
  ): Promise<LessonAccessResult> {
    const [lesson] = await this.database.dataSource.query<LessonAccessRow[]>(
      `SELECT lesson.is_preview AS "isPreview",
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
          SELECT 1 FROM user_roles role
          WHERE role.user_id = $2 AND role.role_code = 'admin'
        ) AS "isAdmin"
      FROM lessons lesson
      INNER JOIN chapters chapter ON chapter.id = lesson.chapter_id
      INNER JOIN courses course ON course.id = chapter.course_id
      WHERE lesson.id = $1`,
      [lessonId, userId ?? null],
    );

    if (!lesson) return { granted: false, reason: 'LESSON_NOT_FOUND' };
    if (userId && (lesson.instructorId === userId || lesson.isAdmin))
      return { granted: true, bypass: true };
    if (lesson.courseStatus !== 'published')
      return { granted: false, reason: 'COURSE_UNAVAILABLE' };
    if (!lesson.isPublished)
      return { granted: false, reason: 'LESSON_UNPUBLISHED' };
    if (lesson.isEnrolled) return { granted: true };
    if (lesson.isPreview && options.allowPreview !== false)
      return { granted: true };
    if (!userId) return { granted: false, reason: 'AUTHENTICATION_REQUIRED' };
    return { granted: false, reason: 'ENROLLMENT_REQUIRED' };
  }
}
