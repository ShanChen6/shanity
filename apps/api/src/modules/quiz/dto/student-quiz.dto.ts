import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { QuizAttemptStatus } from '../entities/quiz-attempt.entity.js';
import {
  QuizDifficulty,
  type GradingPolicy,
  type QuizScope,
  type ReviewPolicy,
} from '../entities/quiz.entity.js';

/*
 * Student read model, separate from the authoring DTOs. Responses are built
 * by StudentQuizTransformer field by field from an allow-list, never by
 * spreading a row or entity: answer keys (`isCorrect`), explanations and
 * authoring metadata (`createdBy`, `updatedAt`, `status`, `version`, shuffle
 * flags) cannot leak by default. Discovery responses carry no questions at
 * all; those are only served from an attempt's snapshot once it has started.
 */

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListStandaloneQuizzesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsEnum(QuizDifficulty)
  difficulty?: QuizDifficulty;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(32)
  tag?: string;
}

export class ListMyAttemptsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  // standalone: STANDALONE only; course: LESSON, CHAPTER and COURSE.
  @IsOptional()
  @IsIn(['all', 'standalone', 'course'])
  scope: 'all' | 'standalone' | 'course' = 'all';
}

/** The read-model row the queries select; nothing else is ever read. */
export type StudentQuizRow = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  scope: QuizScope;
  targetId: string | null;
  isRequired: boolean;
  passingScore: number;
  durationMinutes: number | null;
  maxAttempts: number | null;
  reviewPolicy: ReviewPolicy;
  gradingPolicy: GradingPolicy;
  publishedAt: Date | null;
  difficulty: QuizDifficulty | null;
  tags: string[];
  totalQuestions: number;
  totalPoints: number;
  totalAttempts: number;
};

/** The caller's own standing on the quiz. */
export type StudentQuizProgressRow = {
  attemptsUsed: number;
  hasActiveAttempt: boolean;
  // Any finalized attempt; NEEDS_GRADING is not a result yet.
  hasSubmitted: boolean;
  isPassed: boolean;
  // The learner's most recent closed attempt, for its result page.
  latestAttemptId: string | null;
  highestPercentage: number | null;
  latestStatus: QuizAttemptStatus | null;
  latestPassed: boolean | null;
  latestPercentage: number | null;
  latestSubmittedAt: Date | null;
};

/**
 * The learner's badge: PASSED once any attempt passed (monotonic), else
 * IN_PROGRESS while one runs, else FAILED after a closed attempt.
 */
export type StudentQuizStatus =
  'NOT_STARTED' | 'IN_PROGRESS' | 'PASSED' | 'FAILED';

export class StudentQuizSummaryDto {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  passingScore: number;
  durationMinutes: number | null;
  maxAttempts: number | null;
  totalQuestions: number;
  difficulty: QuizDifficulty | null;
  tags: string[];
  // Closed attempts by all learners.
  totalAttempts: number;
  publishedAt: Date | null;
}

export class StudentQuizDetailDto extends StudentQuizSummaryDto {
  scope: QuizScope;
  isRequired: boolean;
  totalPoints: number;
  reviewPolicy: ReviewPolicy;
  gradingPolicy: GradingPolicy;
  attemptsUsed: number;
  // Null when attempts are unlimited.
  attemptsRemaining: number | null;
  hasActiveAttempt: boolean;
  isPassed: boolean;
  // The learner's best percentage so far; null before any closed attempt.
  highestPercentage: number | null;
  latestResult: {
    attemptId: string;
    status: QuizAttemptStatus;
    passed: boolean | null;
    percentage: number;
    submittedAt: Date | null;
  } | null;
}

export class StudentCourseQuizDto extends StudentQuizDetailDto {
  // LESSON, CHAPTER or COURSE; where the quiz sits in the curriculum.
  targetId: string | null;
  status: StudentQuizStatus;
  latestAttemptId: string | null;
  // Counts as a done step in course progress: a required quiz once passed,
  // an optional one once submitted, pass or fail.
  stepCompleted: boolean;
}

export class StudentQuizTransformer {
  static toSummary(row: StudentQuizRow): StudentQuizSummaryDto {
    return Object.assign(new StudentQuizSummaryDto(), {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      passingScore: row.passingScore,
      durationMinutes: row.durationMinutes,
      maxAttempts: row.maxAttempts,
      totalQuestions: row.totalQuestions,
      difficulty: row.difficulty,
      tags: row.tags,
      totalAttempts: row.totalAttempts,
      publishedAt: row.publishedAt,
    });
  }

  static toDetail(
    row: StudentQuizRow,
    progress: StudentQuizProgressRow,
  ): StudentQuizDetailDto {
    return Object.assign(
      new StudentQuizDetailDto(),
      StudentQuizTransformer.toSummary(row),
      {
        scope: row.scope,
        isRequired: row.isRequired,
        totalPoints: row.totalPoints,
        reviewPolicy: row.reviewPolicy,
        gradingPolicy: row.gradingPolicy,
        attemptsUsed: progress.attemptsUsed,
        attemptsRemaining:
          row.maxAttempts === null
            ? null
            : Math.max(0, row.maxAttempts - progress.attemptsUsed),
        hasActiveAttempt: progress.hasActiveAttempt,
        isPassed: progress.isPassed,
        highestPercentage: progress.highestPercentage,
        latestResult: progress.latestAttemptId
          ? {
              attemptId: progress.latestAttemptId,
              status: progress.latestStatus!,
              passed: progress.latestPassed!,
              percentage: progress.latestPercentage!,
              submittedAt: progress.latestSubmittedAt,
            }
          : null,
      },
    );
  }

  static toCourseQuiz(
    row: StudentQuizRow,
    progress: StudentQuizProgressRow,
  ): StudentCourseQuizDto {
    return Object.assign(
      new StudentCourseQuizDto(),
      StudentQuizTransformer.toDetail(row, progress),
      {
        targetId: row.targetId,
        status: progress.isPassed
          ? 'PASSED'
          : progress.hasActiveAttempt
            ? 'IN_PROGRESS'
            : progress.hasSubmitted
              ? 'FAILED'
              : 'NOT_STARTED',
        latestAttemptId: progress.latestAttemptId,
        stepCompleted: row.isRequired
          ? progress.isPassed
          : progress.hasSubmitted,
      },
    );
  }
}

/** One row of GET /my-quiz-attempts: summary only, never answers or keys. */
export class MyAttemptRowDto {
  attemptId: string;
  quizId: string;
  quizTitle: string;
  // For links: standalone results live under /quizzes/:slug.
  quizSlug: string | null;
  scope: QuizScope;
  courseId: string | null;
  courseSlug: string | null;
  courseTitle: string | null;
  attemptNumber: number;
  status: QuizAttemptStatus;
  // Running past its deadline; its result auto-submits it.
  isExpired: boolean;
  startedAt: Date;
  submittedAt: Date | null;
  expiresAt: Date | null;
  durationSeconds: number | null;
  earnedPoints: number | null;
  totalPoints: number | null;
  percentage: number | null;
  isPassed: boolean | null;

  static from(row: MyAttemptRowDto): MyAttemptRowDto {
    return Object.assign(new MyAttemptRowDto(), {
      attemptId: row.attemptId,
      quizId: row.quizId,
      quizTitle: row.quizTitle,
      quizSlug: row.quizSlug,
      scope: row.scope,
      courseId: row.courseId,
      courseSlug: row.courseSlug,
      courseTitle: row.courseTitle,
      attemptNumber: row.attemptNumber,
      status: row.status,
      isExpired: row.isExpired,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      expiresAt: row.expiresAt,
      durationSeconds: row.durationSeconds,
      earnedPoints: row.earnedPoints,
      totalPoints: row.totalPoints,
      percentage: row.percentage,
      isPassed: row.isPassed,
    });
  }
}
