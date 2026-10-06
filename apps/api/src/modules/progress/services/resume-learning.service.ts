import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
import { CourseProgressEngine } from './course-progress-engine.service.js';

type ResumeRow = {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  lessonId: string | null;
  lessonTitle: string | null;
  lessonSlug: string | null;
  lastPosition: number | string | null;
  hasStarted: boolean;
};

@Injectable()
export class ResumeLearningService {
  constructor(
    private readonly database: DatabaseService,
    private readonly courseProgressEngine: CourseProgressEngine,
  ) {}

  async course(userId: string, courseId: string) {
    const row = await this.resolve(userId, courseId);
    if (!row) throw new ForbiddenException('Active enrollment required');
    return {
      lessonSlug: row.lessonSlug,
      lessonTitle: row.lessonTitle,
      lastPosition: Number(row.lastPosition ?? 0),
      hasStarted: row.hasStarted,
    };
  }

  async latest(userId: string) {
    const [latest] = (await this.database.dataSource.query(
      `SELECT course_id AS "courseId"
       FROM enrollments
       WHERE user_id = $1 AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1 FROM lessons
           WHERE lessons.course_id = enrollments.course_id
             AND lessons.is_published = true
         )
       ORDER BY last_accessed_at DESC NULLS LAST, enrolled_at DESC
       LIMIT 1`,
      [userId],
    )) as Array<{ courseId: string }>;
    if (!latest) return { hasActiveCourse: false };

    const row = await this.resolve(userId, latest.courseId);
    if (!row?.lessonId) return { hasActiveCourse: false };
    const progress = await this.courseProgressEngine.calculate(
      userId,
      row.courseId,
    );
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

  private async resolve(userId: string, courseId: string) {
    const [row] = (await this.database.dataSource.query(
      `SELECT course.id AS "courseId", course.title AS "courseTitle",
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
         AND enrollment.revoked_at IS NULL`,
      [userId, courseId],
    )) as ResumeRow[];
    return row;
  }
}
