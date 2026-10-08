import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import {
  MyAttemptRowDto,
  StudentQuizTransformer,
  type ListMyAttemptsQueryDto,
  type ListStandaloneQuizzesQueryDto,
  type StudentQuizProgressRow,
  type StudentQuizRow,
} from '../dto/student-quiz.dto.js';
import {
  QUIZ_COURSE_JOINS,
  courseQuizzesSql,
} from './quiz-course-resolver.service.js';

// Draft, archived, missing and course-bound slugs all look the same, so the
// response never reveals that an unpublished quiz exists.
const QUIZ_FORBIDDEN = {
  statusCode: 403,
  message: 'QUIZ_FORBIDDEN',
  code: 'QUIZ_FORBIDDEN',
};

// The only quiz columns the student read model ever selects (`quiz` alias).
// Question and option rows are aggregated, never selected.
const STUDENT_QUIZ_COLUMNS = `quiz.id, quiz.slug, quiz.title, quiz.description,
  quiz.scope, quiz.target_id AS "targetId", quiz.is_required AS "isRequired",
  quiz.passing_score AS "passingScore",
  quiz.duration_minutes AS "durationMinutes",
  quiz.max_attempts AS "maxAttempts", quiz.review_policy AS "reviewPolicy",
  quiz.grading_policy AS "gradingPolicy", quiz.published_at AS "publishedAt",
  quiz.difficulty, quiz.tags,
  totals."totalQuestions", totals."totalPoints", totals."totalAttempts"`;

// totalAttempts: closed attempts by everyone, a popularity figure.
const TOTALS_JOIN = `CROSS JOIN LATERAL (
    SELECT count(*)::int AS "totalQuestions",
      coalesce(sum(question.points), 0)::int AS "totalPoints",
      (SELECT count(*)::int FROM quiz_attempts taken
       WHERE taken.quiz_id = quiz.id
         AND taken.status IN (
           'NEEDS_GRADING', 'GRADED', 'COMPLETED', 'SUBMITTED', 'TIMED_OUT'
         )) AS "totalAttempts"
    FROM quiz_questions question WHERE question.quiz_id = quiz.id
  ) totals`;

// `userParam` is a bind placeholder. A pass is any closed passed attempt, as
// in course progress.
const progressJoin = (userParam: string) => `CROSS JOIN LATERAL (
    SELECT count(*)::int AS "attemptsUsed",
      coalesce(bool_or(attempt.status IN (
        'IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING', 'GRADED'
      )), false)
        AS "hasActiveAttempt",
      coalesce(bool_or(attempt.status IN (
        'COMPLETED', 'SUBMITTED', 'TIMED_OUT'
      )), false)
        AS "hasSubmitted",
      coalesce(bool_or(attempt.status IN ('COMPLETED', 'SUBMITTED', 'TIMED_OUT')
        AND attempt.is_passed), false) AS "isPassed",
      (array_agg(attempt.id ORDER BY attempt.attempt_number DESC)
        FILTER (WHERE attempt.status IN (
          'NEEDS_GRADING', 'GRADED', 'COMPLETED', 'SUBMITTED', 'TIMED_OUT'
        )))[1]
        AS "latestAttemptId",
      max(attempt.percentage) FILTER (WHERE attempt.status IN (
        'COMPLETED', 'SUBMITTED', 'TIMED_OUT'
      ))::float8 AS "highestPercentage"
    FROM quiz_attempts attempt
    WHERE attempt.quiz_id = quiz.id AND attempt.user_id = ${userParam}
  ) mine
  LEFT JOIN LATERAL (
    SELECT latest.status AS "latestStatus", latest.is_passed AS "latestPassed",
      latest.percentage::float8 AS "latestPercentage",
      latest.submitted_at AS "latestSubmittedAt"
    FROM quiz_attempts latest WHERE latest.id = mine."latestAttemptId"
  ) latest ON true`;
const PROGRESS_COLUMNS = `mine."attemptsUsed", mine."hasActiveAttempt",
  mine."hasSubmitted", mine."isPassed", mine."latestAttemptId",
  mine."highestPercentage", latest."latestStatus", latest."latestPassed",
  latest."latestPercentage", latest."latestSubmittedAt"`;

type Row = StudentQuizRow & StudentQuizProgressRow;

/** Discovery reads for learners; nothing here starts or reveals an attempt. */
@Injectable()
export class QuizStudentReadService {
  constructor(private readonly dataSource: DataSource) {}

  /** Published STANDALONE quizzes, newest first. */
  async listStandalone(query: ListStandaloneQuizzesQueryDto) {
    const { page, limit } = query;
    const rows = await this.dataSource.query<
      Array<StudentQuizRow & { totalItems: string }>
    >(
      `SELECT ${STUDENT_QUIZ_COLUMNS}, COUNT(*) OVER () AS "totalItems"
       FROM quizzes quiz
       ${TOTALS_JOIN}
       WHERE quiz.scope = 'STANDALONE' AND quiz.status = 'PUBLISHED'
         AND ($1::text IS NULL
           OR position(lower($1) IN lower(quiz.title)) > 0
           OR position(lower($1) IN lower(coalesce(quiz.slug, ''))) > 0
           OR $1 = ANY (quiz.tags))
         AND ($4::"QuizDifficulty" IS NULL OR quiz.difficulty = $4)
         AND ($5::text IS NULL OR $5 = ANY (quiz.tags))
       ORDER BY quiz.published_at DESC NULLS LAST, quiz.id
       LIMIT $2 OFFSET $3`,
      [
        query.search || null,
        limit,
        (page - 1) * limit,
        query.difficulty ?? null,
        query.tag?.toLowerCase() || null,
      ],
    );
    const totalItems = Number(rows[0]?.totalItems ?? 0);
    return {
      quizzes: rows.map((row) => StudentQuizTransformer.toSummary(row)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }

  /** A published STANDALONE quiz's overview, without its questions. */
  async standaloneBySlug(principal: Principal, slug: string) {
    const [row] = await this.dataSource.query<Row[]>(
      `SELECT ${STUDENT_QUIZ_COLUMNS}, ${PROGRESS_COLUMNS}
       FROM quizzes quiz
       ${TOTALS_JOIN}
       ${progressJoin('$2')}
       WHERE quiz.slug = $1 AND quiz.scope = 'STANDALONE'
         AND quiz.status = 'PUBLISHED'`,
      [slug, principal.id],
    );
    if (!row) throw new ForbiddenException(QUIZ_FORBIDDEN);
    return StudentQuizTransformer.toDetail(row, row);
  }

  /**
   * The course's published course-bound quizzes in curriculum order: by
   * chapter, a chapter's lesson quizzes before its chapter quiz, and
   * course-level quizzes last. Callers must have passed CourseEnrollmentGuard.
   */
  async listForCourse(principal: Principal, courseId: string) {
    const rows = await this.dataSource.query<Row[]>(
      `SELECT ${STUDENT_QUIZ_COLUMNS}, ${PROGRESS_COLUMNS}
       FROM (${courseQuizzesSql('$1::uuid')}) course_quiz
       INNER JOIN quizzes quiz ON quiz.id = course_quiz.id
       ${QUIZ_COURSE_JOINS}
       ${TOTALS_JOIN}
       ${progressJoin('$2')}
       ORDER BY
         coalesce(target_chapter.position, target_lesson_chapter.position)
           NULLS LAST,
         coalesce(target_chapter.id, target_lesson_chapter.id),
         target_lesson.position NULLS LAST, target_lesson.id,
         quiz.title, quiz.id`,
      [courseId, principal.id],
    );
    return {
      quizzes: rows.map((row) => StudentQuizTransformer.toCourseQuiz(row, row)),
    };
  }

  /**
   * The learner's own attempts across every scope, newest first. Titles and
   * scope come from each attempt's frozen snapshot; slugs are looked up
   * live only to build links. An IN_PROGRESS attempt past its deadline is
   * reported as `isExpired`: asking for its result auto-submits it.
   */
  async myAttempts(principal: Principal, query: ListMyAttemptsQueryDto) {
    const { page, limit } = query;
    const rows = await this.dataSource.query<
      Array<MyAttemptRowDto & { totalItems: string }>
    >(
      `SELECT attempt.id AS "attemptId", attempt.quiz_id AS "quizId",
         attempt.quiz_snapshot->'quiz'->>'title' AS "quizTitle",
         quiz.slug AS "quizSlug",
         attempt.quiz_snapshot->'quiz'->>'scope' AS scope,
         course.id AS "courseId", course.slug AS "courseSlug",
         course.title AS "courseTitle",
         attempt.attempt_number AS "attemptNumber", attempt.status,
         attempt.started_at AS "startedAt",
         attempt.submitted_at AS "submittedAt",
         attempt.expires_at AS "expiresAt",
         (attempt.status = 'IN_PROGRESS' AND attempt.expires_at IS NOT NULL
           AND clock_timestamp() > attempt.expires_at) AS "isExpired",
         extract(epoch FROM attempt.submitted_at - attempt.started_at)::int
           AS "durationSeconds",
         attempt.earned_points AS "earnedPoints",
         attempt.total_points AS "totalPoints",
         attempt.percentage::float8 AS percentage,
         attempt.is_passed AS "isPassed",
         COUNT(*) OVER () AS "totalItems"
       FROM quiz_attempts attempt
       INNER JOIN quizzes quiz ON quiz.id = attempt.quiz_id
       LEFT JOIN courses course
         ON course.id = (attempt.quiz_snapshot->'quiz'->>'courseId')::uuid
       WHERE attempt.user_id = $1
         AND CASE $2
           WHEN 'standalone'
             THEN attempt.quiz_snapshot->'quiz'->>'scope' = 'STANDALONE'
           WHEN 'course'
             THEN attempt.quiz_snapshot->'quiz'->>'scope' <> 'STANDALONE'
           ELSE true END
       ORDER BY attempt.started_at DESC, attempt.id
       LIMIT $3 OFFSET $4`,
      [principal.id, query.scope, limit, (page - 1) * limit],
    );
    const totalItems = Number(rows[0]?.totalItems ?? 0);
    return {
      attempts: rows.map((row) => MyAttemptRowDto.from(row)),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    };
  }
}
