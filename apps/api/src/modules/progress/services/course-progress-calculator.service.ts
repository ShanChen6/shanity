import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { ProgressCache } from '../cache/progress-cache.js';
import { LessonProgressStatus } from '../entities/lesson-progress.entity.js';
import { CourseProgressSummaryDto } from '../dto/course-progress-summary.dto.js';
import type { EnrolledCourseDto } from '../dto/enrolled-course.dto.js';
import { courseQuizzesSql } from '../../quiz/services/quiz-course-resolver.service.js';

// A course with nothing to do counts as fully done.
export const progressPercentage = (completed: number, total: number) =>
  total > 0 ? Math.min(100, Math.floor((completed * 100) / total)) : 100;

type SummaryRow = {
  courseId: string;
  userId: string;
  totalLessons: number | string;
  totalRequiredLessons: number | string;
  completedLessons: number | string;
  completedRequiredLessons: number | string;
  // Absent (0) for courses without course-bound quizzes.
  totalQuizzes?: number | string | null;
  totalRequiredQuizzes?: number | string | null;
  passedQuizzes?: number | string | null;
  passedRequiredQuizzes?: number | string | null;
  lastAccessedLessonId: string | null;
  updatedAt: Date | string;
};

// Per enrollment row: the course's published course-bound quizzes and which
// of them this learner has passed. A pass is any closed (SUBMITTED or
// TIMED_OUT) attempt with is_passed, so achieved completion is monotonic: a
// later failing attempt never takes it back. STANDALONE quizzes never count.
const QUIZ_STATS_JOIN = `
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE course_quiz.is_required)::int AS required,
      count(*) FILTER (WHERE result.passed)::int AS passed,
      count(*) FILTER (
        WHERE course_quiz.is_required AND result.passed
      )::int AS passed_required
    FROM (${courseQuizzesSql('course.id')}) course_quiz
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM quiz_attempts attempt
        WHERE attempt.user_id = enrollment.user_id
          AND attempt.quiz_id = course_quiz.id
          AND attempt.status IN ('SUBMITTED', 'TIMED_OUT')
          AND attempt.is_passed
      ) AS passed
    ) result
  ) quiz_stats ON true`;

/**
 * The single implementation of course progress. Two separate figures:
 *
 *   Learning progress (UI bar), over required lessons and course-bound quizzes:
 *     percentage = min(100, floor((completed required lessons + passed quizzes)
 *                               / (required lessons + quizzes) * 100))
 *
 *   Course completion (the gate):
 *     isCompleted = every published required lesson completed
 *               AND every published required course-bound quiz passed
 *
 * Optional quizzes move the bar but never block completion; STANDALONE quizzes
 * affect neither. So a learner can be completed below 100% (an optional quiz
 * left), and 100% always implies completed.
 *
 * Nothing stores either figure. Both are derived on every read from
 * lesson_progress, quiz_attempts and the course's *current* lessons and
 * quizzes, so curriculum edits are reflected on the next query with no
 * migration or backfill. Floor (not round) guarantees 100% means everything
 * counted is done: 199/200 is 99%.
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

  /** The UI progress bar: lessons and course-bound quizzes done / total. */
  async calculateLearningProgressPercentage(userId: string, courseId: string) {
    return (await this.calculate(userId, courseId)).percentage;
  }

  /** Required lessons completed and required course-bound quizzes passed. */
  async evaluateCourseCompletion(userId: string, courseId: string) {
    return (await this.calculate(userId, courseId)).isCompleted;
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
       ${QUIZ_STATS_JOIN}
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
       ${QUIZ_STATS_JOIN}
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
          isCompleted: summary.isCompleted,
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
      -- One value per enrollment row; MAX only collapses the lesson fan-out.
      MAX(quiz_stats.total) AS "totalQuizzes",
      MAX(quiz_stats.required) AS "totalRequiredQuizzes",
      MAX(quiz_stats.passed) AS "passedQuizzes",
      MAX(quiz_stats.passed_required) AS "passedRequiredQuizzes",
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
    const totalQuizzes = Number(row.totalQuizzes ?? 0);
    const totalRequiredQuizzes = Number(row.totalRequiredQuizzes ?? 0);
    const passedQuizzes = Number(row.passedQuizzes ?? 0);
    const passedRequiredQuizzes = Number(row.passedRequiredQuizzes ?? 0);
    const percentage = progressPercentage(
      completedRequiredLessons + passedQuizzes,
      totalRequiredLessons + totalQuizzes,
    );
    return {
      courseId: row.courseId,
      userId: row.userId,
      totalLessons,
      totalRequiredLessons,
      completedLessons,
      completedRequiredLessons,
      totalQuizzes,
      totalRequiredQuizzes,
      passedQuizzes,
      passedRequiredQuizzes,
      percentage,
      isCompleted:
        completedRequiredLessons >= totalRequiredLessons &&
        passedRequiredQuizzes >= totalRequiredQuizzes,
      ...(row.lastAccessedLessonId
        ? { lastAccessedLessonId: row.lastAccessedLessonId }
        : {}),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
