import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.module.js';

export type LessonAccessResult = {
  granted: boolean;
  reason?: 'LESSON_NOT_FOUND' | 'AUTHENTICATION_REQUIRED' | 'ENROLLMENT_REQUIRED';
};

interface LessonAccessRow {
  isPreview: boolean;
  isEnrolled: boolean;
}

@Injectable()
export class CourseAccessService {
  constructor(private readonly database: DatabaseService) {}

  async canAccessLesson(
    userId: string | undefined,
    lessonId: string,
  ): Promise<LessonAccessResult> {
    const [lesson] = await this.database.dataSource.query<LessonAccessRow[]>(
      `SELECT lesson.is_preview AS "isPreview",
        EXISTS (
          SELECT 1
          FROM enrollments enrollment
          WHERE enrollment.user_id = $2
            AND enrollment.course_id = lesson.course_id
            AND enrollment.revoked_at IS NULL
        ) AS "isEnrolled"
      FROM lessons lesson
      WHERE lesson.id = $1`,
      [lessonId, userId ?? null],
    );

    if (!lesson) return { granted: false, reason: 'LESSON_NOT_FOUND' };
    if (lesson.isPreview) return { granted: true };
    if (!userId) return { granted: false, reason: 'AUTHENTICATION_REQUIRED' };
    if (!lesson.isEnrolled)
      return { granted: false, reason: 'ENROLLMENT_REQUIRED' };
    return { granted: true };
  }
}
