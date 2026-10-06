import { BadRequestException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { QuizScope } from '../entities/quiz.entity.js';
import { QuizCourseResolverService } from './quiz-course-resolver.service.js';

export const QuizTargetErrorCode = {
  INVALID_QUIZ_SCOPE: 'INVALID_QUIZ_SCOPE',
  INVALID_TARGET_LESSON: 'INVALID_TARGET_LESSON',
  INVALID_TARGET_CHAPTER: 'INVALID_TARGET_CHAPTER',
  INVALID_TARGET_COURSE: 'INVALID_TARGET_COURSE',
  STANDALONE_QUIZ_CANNOT_HAVE_TARGET: 'STANDALONE_QUIZ_CANNOT_HAVE_TARGET',
  INVALID_QUIZ_TARGET: 'INVALID_QUIZ_TARGET',
} as const;
export type QuizTargetErrorCode =
  (typeof QuizTargetErrorCode)[keyof typeof QuizTargetErrorCode];

const INVALID_TARGET: Record<
  Exclude<QuizScope, QuizScope.STANDALONE>,
  QuizTargetErrorCode
> = {
  [QuizScope.LESSON]: QuizTargetErrorCode.INVALID_TARGET_LESSON,
  [QuizScope.CHAPTER]: QuizTargetErrorCode.INVALID_TARGET_CHAPTER,
  [QuizScope.COURSE]: QuizTargetErrorCode.INVALID_TARGET_COURSE,
};

export type ValidatedQuizTarget = {
  scope: QuizScope;
  targetId: string | null;
  // Owning Course, null for STANDALONE; feeds the authoring permission check.
  courseId: string | null;
};

function reject(code: QuizTargetErrorCode): never {
  throw new BadRequestException({ statusCode: 400, message: code, code });
}

const isQuizScope = (value: unknown): value is QuizScope =>
  Object.values(QuizScope).includes(value as QuizScope);

/**
 * Application guard for the scope/target association matrix. The database
 * (CHK_quizzes_scope_target_integrity + FK_quizzes_target) stays the final
 * authority; this turns the same rules into stable 400 codes up front.
 */
@Injectable()
export class QuizTargetValidationService {
  constructor(private readonly resolver: QuizCourseResolverService) {}

  /** Pass the write transaction's manager so the check sees the same state. */
  async validate(
    scope: unknown,
    targetId: unknown,
    manager?: EntityManager,
  ): Promise<ValidatedQuizTarget> {
    if (!isQuizScope(scope)) reject(QuizTargetErrorCode.INVALID_QUIZ_SCOPE);
    if (scope === QuizScope.STANDALONE) {
      if (targetId !== null && targetId !== undefined)
        reject(QuizTargetErrorCode.STANDALONE_QUIZ_CANNOT_HAVE_TARGET);
      return { scope, targetId: null, courseId: null };
    }

    const code = INVALID_TARGET[scope];
    if (typeof targetId !== 'string') reject(code);
    const courseId = await this.resolver.findTargetCourseId(
      { scope, targetId },
      manager,
    );
    if (!courseId) reject(code);
    return { scope, targetId, courseId };
  }
}

/**
 * Maps a database scope/target violation (e.g. the target was deleted between
 * validation and commit) to a 400; rethrows anything else unchanged.
 */
export function rethrowQuizTargetViolation(error: unknown): never {
  const { code, constraint } = (error ?? {}) as {
    code?: string;
    constraint?: string;
  };
  if (
    (code === '23514' && constraint === 'CHK_quizzes_scope_target_integrity') ||
    (code === '23503' && constraint === 'FK_quizzes_target')
  )
    reject(QuizTargetErrorCode.INVALID_QUIZ_TARGET);
  throw error;
}
