import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
import { LessonProgressStatus } from '../entities/lesson-progress.entity.js';
import { CourseProgressSummaryDto } from '../dto/course-progress-summary.dto.js';

type SummaryRow = {
  courseId: string;
  userId: string;
  totalLessons: number | string;
  totalRequiredLessons: number | string;
  completedLessons: number | string;
  completedRequiredLessons: number | string;
  lastAccessedLessonId: string | null;
  updatedAt: Date | string;
};

@Injectable()
export class CourseProgressEngine {
  constructor(private readonly database: DatabaseService) {}

  async calculate(
    userId: string,
    courseId: string,
  ): Promise<CourseProgressSummaryDto> {
    const [row] = (await this.database.dataSource.query(
      `${this.summarySelect('$3')}
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
       GROUP BY enrollment.user_id, enrollment.enrolled_at, course.id`,
      [userId, courseId, LessonProgressStatus.COMPLETED],
    )) as SummaryRow[];
    return this.toSummary(
      row ?? {
        courseId,
        userId,
        totalLessons: 0,
        totalRequiredLessons: 0,
        completedLessons: 0,
        completedRequiredLessons: 0,
        lastAccessedLessonId: null,
        updatedAt: new Date(0),
      },
    );
  }

  async enrolledCourses(userId: string) {
    const rows = (await this.database.dataSource.query(
      `${this.summarySelect('$2')},
              course.title, course.slug, course.thumbnail,
              (ARRAY_AGG(lesson.slug ORDER BY progress.last_accessed_at DESC)
                FILTER (WHERE progress.id IS NOT NULL))[1] AS "lastAccessedLessonSlug"
       FROM enrollments enrollment
       INNER JOIN courses course ON course.id = enrollment.course_id
       LEFT JOIN lessons lesson
         ON lesson.course_id = course.id AND lesson.is_published = true
       LEFT JOIN lesson_progress progress
         ON progress.lesson_id = lesson.id
        AND progress.user_id = enrollment.user_id
        AND progress.course_id = course.id
       WHERE enrollment.user_id = $1 AND enrollment.revoked_at IS NULL
       GROUP BY enrollment.user_id, enrollment.enrolled_at, course.id
       ORDER BY enrollment.enrolled_at DESC`,
      [userId, LessonProgressStatus.COMPLETED],
    )) as Array<
      SummaryRow & {
        title: string;
        slug: string;
        thumbnail: string | null;
        lastAccessedLessonSlug: string | null;
      }
    >;
    return rows.map((row) => ({
      course: {
        id: row.courseId,
        title: row.title,
        slug: row.slug,
        thumbnail: row.thumbnail,
      },
      progress: this.toSummary(row),
      lastAccessedLessonSlug: row.lastAccessedLessonSlug ?? undefined,
    }));
  }

  private summarySelect(statusParameter: string) {
    return `SELECT course.id AS "courseId", enrollment.user_id AS "userId",
      COUNT(lesson.id)::int AS "totalLessons",
      COUNT(lesson.id) FILTER (WHERE lesson.is_required = true)::int AS "totalRequiredLessons",
      COUNT(progress.id) FILTER (WHERE progress.status = ${statusParameter})::int AS "completedLessons",
      COUNT(progress.id) FILTER (
        WHERE lesson.is_required = true AND progress.status = ${statusParameter}
      )::int AS "completedRequiredLessons",
      (ARRAY_AGG(progress.lesson_id ORDER BY progress.last_accessed_at DESC)
        FILTER (WHERE progress.id IS NOT NULL))[1] AS "lastAccessedLessonId",
      COALESCE(
        MAX(GREATEST(progress.updated_at, progress.last_accessed_at)),
        enrollment.enrolled_at
      ) AS "updatedAt"`;
  }

  private toSummary(row: SummaryRow): CourseProgressSummaryDto {
    const totalLessons = Number(row.totalLessons);
    const totalRequiredLessons = Number(row.totalRequiredLessons);
    const completedLessons = Number(row.completedLessons);
    const completedRequiredLessons = Number(row.completedRequiredLessons);
    const percentage = totalRequiredLessons
      ? Math.min(
          100,
          Math.round((completedRequiredLessons / totalRequiredLessons) * 100),
        )
      : 100;
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
}
