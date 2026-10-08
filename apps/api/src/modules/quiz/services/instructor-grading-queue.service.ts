import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import {
  CourseOwnershipService,
  managesCourseSql,
} from '../../../courses/course-ownership.service.js';
import type {
  GradingQueueItemDto,
  GradingQueueQueryDto,
  GradingQueueResponseDto,
} from '../dto/grading-queue.dto.js';
import { QuizScope } from '../entities/quiz.entity.js';
import {
  QuizCourseResolverService,
  QuizTargetNotFoundError,
} from './quiz-course-resolver.service.js';

export const GRADING_COURSE_FORBIDDEN =
  'You do not have permission to access grading queue for this course';
export const GRADING_QUIZ_FORBIDDEN =
  'You do not have permission to access grading queue for this quiz';

type Row = {
  attemptId: string;
  studentId: string;
  fullName: string;
  email: string;
  avatarKey: string | null;
  courseId: string | null;
  courseTitle: string | null;
  courseSlug: string | null;
  quizId: string;
  quizTitle: string;
  submittedAt: Date | null;
  publishedAt: Date | null;
  status: 'NEEDS_GRADING' | 'GRADED' | 'COMPLETED';
  totalEssays: number;
  pendingEssaysCount: number;
  totalItems: string;
};

// Escapes LIKE wildcards so a search for "100%" matches literally.
const likePattern = (term: string) =>
  `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * The instructor's grading queue: closed attempts that contain essays.
 *
 * Authorization is part of the query, not a post-filter: an instructor only
 * ever reads attempts of courses they own, teach or are assigned to
 * (CourseOwnershipService's own predicate), plus STANDALONE quizzes they
 * authored. Admins read everything. Naming a course or quiz outside that
 * scope is a 403, so an instructor cannot probe other courses.
 */
@Injectable()
export class InstructorGradingQueueService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ownership: CourseOwnershipService,
    private readonly resolver: QuizCourseResolverService,
  ) {}

  async list(
    principal: Principal,
    query: GradingQueueQueryDto,
  ): Promise<GradingQueueResponseDto> {
    const isAdmin = principal.roles.includes('admin');
    if (!isAdmin && !principal.roles.includes('instructor'))
      throw new ForbiddenException(GRADING_COURSE_FORBIDDEN);
    if (
      query.courseId &&
      !(await this.ownership.canManageCourse(principal, query.courseId))
    )
      throw new ForbiddenException(GRADING_COURSE_FORBIDDEN);
    if (query.quizId && !(await this.canGradeQuiz(principal, query.quizId)))
      throw new ForbiddenException(GRADING_QUIZ_FORBIDDEN);

    const params: unknown[] = [principal.id];
    const bind = (value: unknown) => `$${params.push(value)}`;
    const filters: string[] = [
      `attempt.status IN ('NEEDS_GRADING', 'GRADED', 'COMPLETED')`,
      'essays.total > 0',
    ];
    if (!isAdmin)
      filters.push(`(
        (course.id IS NOT NULL AND ${managesCourseSql('$1')})
        OR (course.id IS NULL AND quiz.created_by = $1)
      )`);
    if (query.courseId) filters.push(`course.id = ${bind(query.courseId)}`);
    if (query.quizId) filters.push(`attempt.quiz_id = ${bind(query.quizId)}`);
    if (query.status === 'NEEDS_GRADING')
      filters.push(
        `attempt.status = 'NEEDS_GRADING' AND essays.total - essays.graded > 0`,
      );
    if (query.status === 'GRADED') filters.push(`attempt.status = 'GRADED'`);
    if (query.status === 'PUBLISHED')
      filters.push(`attempt.status = 'COMPLETED'`);
    if (query.search) {
      const pattern = bind(likePattern(query.search));
      filters.push(
        `(student.display_name ILIKE ${pattern} OR student.email ILIKE ${pattern})`,
      );
    }
    const limit = bind(query.limit);
    const offset = bind((query.page - 1) * query.limit);

    const rows = await this.dataSource.query<Row[]>(
      `SELECT attempt.id AS "attemptId", student.id AS "studentId",
         student.display_name AS "fullName", student.email,
         student.avatar_key AS "avatarKey",
         course.id AS "courseId", course.title AS "courseTitle",
         course.slug AS "courseSlug", attempt.quiz_id AS "quizId",
         attempt.quiz_snapshot->'quiz'->>'title' AS "quizTitle",
         attempt.submitted_at AS "submittedAt", attempt.status,
         attempt.published_at AS "publishedAt",
         essays.total AS "totalEssays",
         (essays.total - essays.graded) AS "pendingEssaysCount",
         COUNT(*) OVER () AS "totalItems"
       FROM quiz_attempts attempt
       INNER JOIN quizzes quiz ON quiz.id = attempt.quiz_id
       INNER JOIN users student ON student.id = attempt.user_id
       LEFT JOIN courses course
         ON course.id = (attempt.quiz_snapshot->'quiz'->>'courseId')::uuid
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS total,
           count(*) FILTER (WHERE answer.grading->>'status' = 'GRADED')::int
             AS graded
         FROM jsonb_array_elements(attempt.quiz_snapshot->'questions') question
         LEFT JOIN attempt_answers answer
           ON answer.attempt_id = attempt.id
          AND answer.question_id = (question->>'id')::uuid
         WHERE question->>'type' = 'ESSAY'
       ) essays
       WHERE ${filters.join(' AND ')}
       ORDER BY (attempt.status = 'NEEDS_GRADING') DESC,
         attempt.submitted_at ASC NULLS LAST, attempt.id
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    const totalItems = Number(rows[0]?.totalItems ?? 0);
    return {
      items: rows.map((row): GradingQueueItemDto => ({
        attemptId: row.attemptId,
        student: {
          id: row.studentId,
          fullName: row.fullName,
          email: row.email,
          avatarUrl: row.avatarKey ? `/avatars/${row.avatarKey}` : null,
        },
        course: row.courseId
          ? {
              id: row.courseId,
              title: row.courseTitle!,
              slug: row.courseSlug,
            }
          : null,
        quiz: { id: row.quizId, title: row.quizTitle },
        submittedAt: row.submittedAt,
        totalEssays: row.totalEssays,
        pendingEssaysCount: row.pendingEssaysCount,
        status: row.status,
        publishedAt: row.publishedAt,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalItems,
        totalPages: Math.ceil(totalItems / query.limit),
      },
    };
  }

  /**
   * Whether the caller may grade an attempt of this course (or, with no
   * course, of a STANDALONE quiz): admins, anyone who manages the course, or
   * the standalone quiz's author. The one rule shared by queue and grading.
   */
  async canGradeTarget(
    principal: Principal,
    target: { courseId: string | null; quizId: string },
  ) {
    if (principal.roles.includes('admin')) return true;
    if (!principal.roles.includes('instructor')) return false;
    if (target.courseId)
      return this.ownership.canManageCourse(principal, target.courseId);
    const [quiz] = await this.dataSource.query<
      Array<{ createdBy: string | null }>
    >('SELECT created_by AS "createdBy" FROM quizzes WHERE id = $1', [
      target.quizId,
    ]);
    return quiz?.createdBy === principal.id;
  }

  /** The courses the caller may grade (the course filter's options). */
  async courses(principal: Principal) {
    const isAdmin = principal.roles.includes('admin');
    if (!isAdmin && !principal.roles.includes('instructor'))
      throw new ForbiddenException(GRADING_COURSE_FORBIDDEN);
    return this.dataSource.query<
      Array<{ id: string; title: string; slug: string | null }>
    >(
      `SELECT course.id, course.title, course.slug FROM courses course
       WHERE ${isAdmin ? 'true' : managesCourseSql('$1')}
       ORDER BY course.title, course.id`,
      isAdmin ? [] : [principal.id],
    );
  }

  /** The quiz's course is managed by the caller, or they authored a STANDALONE one. */
  async canGradeQuiz(principal: Principal, quizId: string) {
    const [quiz] = await this.dataSource.query<
      Array<{
        id: string;
        scope: QuizScope;
        targetId: string | null;
        createdBy: string | null;
      }>
    >(
      `SELECT id, scope, target_id AS "targetId", created_by AS "createdBy"
       FROM quizzes WHERE id = $1`,
      [quizId],
    );
    if (!quiz) return false;
    if (principal.roles.includes('admin')) return true;
    if (quiz.scope === QuizScope.STANDALONE)
      return quiz.createdBy === principal.id;
    try {
      return await this.ownership.canManageCourse(
        principal,
        await this.resolver.resolveCourseIdByQuiz(quiz),
      );
    } catch (reason) {
      if (reason instanceof QuizTargetNotFoundError) return false;
      throw reason;
    }
  }
}
