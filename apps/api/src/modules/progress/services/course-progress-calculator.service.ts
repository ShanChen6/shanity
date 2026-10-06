import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { ProgressCache } from '../cache/progress-cache.js';
import { LessonProgressStatus } from '../entities/lesson-progress.entity.js';
import { CourseProgressSummaryDto } from '../dto/course-progress-summary.dto.js';
import type { EnrolledCourseDto } from '../dto/enrolled-course.dto.js';

// A course with no published required lessons has nothing left to do.
export const progressPercentage = (completed: number, total: number) =>
  total > 0 ? Math.min(100, Math.floor((completed * 100) / total)) : 100;

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

/**
 * The single implementation of course progress:
 *
 *   percentage = min(100, floor(completed required / published required * 100))
 *
 * Nothing stores a percentage. It is derived on every read from
 * lesson_progress and the course's *current* lessons, so adding, deleting,
 * unpublishing or toggling isRequired is reflected on the next query with no
 * migration or backfill. Floor (not round) guarantees 100% means every
 * required lesson is done: 199/200 is 99%, never "completed".
 *
 * The calculation is one read-only statement (one MVCC snapshot), so
 * concurrent completions/heartbeats cannot interleave into a wrong total and
 * there is no read-modify-write to lock. Writes stay idempotent through the
 * (user_id, lesson_id) unique constraint and upserts in ProgressService.
 */
@Injectable()
export class CourseProgressCalculatorService implements OnModuleInit {
  constructor(
    private readonly database: DatabaseService,
    private readonly cache: ProgressCache,
    private readonly curriculum: CurriculumEvents,
  ) {}

  onModuleInit() {
    this.curriculum.onChanged(({ courseId }) =>
      this.invalidateCourseProgressCache(courseId),
    );
  }

  /** Curriculum changed: every student's cached progress is stale. */
  invalidateCourseProgressCache(courseId: string) {
    return this.cache.invalidateCourse(courseId);
  }

  /** One student's lesson progress changed. */
  invalidateStudentProgress(userId: string, courseId: string) {
    return this.cache.invalidateStudent(userId, courseId);
  }

  async calculate(
    userId: string,
    courseId: string,
  ): Promise<CourseProgressSummaryDto> {
    const cached = await this.cache.get(userId, courseId);
    if (cached) return cached;
    const summary = await this.compute(userId, courseId);
    await this.cache.set(summary);
    return summary;
  }

  private async compute(
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
       GROUP BY enrollment.user_id, enrollment.enrolled_at,
                enrollment.last_accessed_lesson_id,
                enrollment.last_accessed_at, course.id`,
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

  async enrolledCourses(userId: string): Promise<EnrolledCourseDto[]> {
    const rows = (await this.database.dataSource.query(
      `${this.summarySelect('$2')},
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
                enrollment.enrolled_at DESC`,
      [userId, LessonProgressStatus.COMPLETED],
    )) as Array<
      SummaryRow & {
        title: string;
        slug: string;
        thumbnail: string | null;
        instructorName: string | null;
        lastAccessedLessonSlug: string | null;
        lastAccessedAt: Date | string | null;
      }
    >;
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

  private summarySelect(statusParameter: string) {
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

  private toSummary(row: SummaryRow): CourseProgressSummaryDto {
    const totalLessons = Number(row.totalLessons);
    const totalRequiredLessons = Number(row.totalRequiredLessons);
    const completedLessons = Number(row.completedLessons);
    const completedRequiredLessons = Number(row.completedRequiredLessons);
    const percentage = progressPercentage(
      completedRequiredLessons,
      totalRequiredLessons,
    );
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
