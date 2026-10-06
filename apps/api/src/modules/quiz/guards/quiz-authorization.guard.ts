import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import type { AuthRequest } from '../../../auth/auth.guards.js';
import type { Principal } from '../../../auth/auth.service.js';
import { CourseOwnershipService } from '../../../courses/course-ownership.service.js';
import { QuizEntity, QuizScope } from '../entities/quiz.entity.js';
import {
  QuizCourseResolverService,
  QuizTargetNotFoundError,
} from '../services/quiz-course-resolver.service.js';

const forbiddenBody = (code: string) => ({
  statusCode: 403,
  message: code,
  code,
});
export const QUIZ_FORBIDDEN = forbiddenBody('QUIZ_FORBIDDEN');
// Creating a quiz on a target in a course the caller does not manage.
export const TARGET_COURSE_FORBIDDEN = forbiddenBody('TARGET_COURSE_FORBIDDEN');
export const FORBIDDEN_RESOURCE = forbiddenBody('FORBIDDEN_RESOURCE');

export type AuthorizedQuiz = Pick<
  QuizEntity,
  'id' | 'scope' | 'targetId' | 'status' | 'createdBy'
> & {
  // Null for STANDALONE, or when a contextual target no longer resolves.
  courseId: string | null;
};
export type QuizAuthorizationRequest = AuthRequest & { quiz?: AuthorizedQuiz };

type QuizAuthorization = { quiz: AuthorizedQuiz } | { denied: true };

const AUTHORING_ROLES = ['instructor', 'admin'];

/**
 * The single authorization gate for quiz authoring routes. Runs after
 * SessionGuard. The quiz is found from `:quizId`, `:id`, `:questionId` or
 * `:optionId` (in that order) and attached as `request.quiz`.
 *
 * | principal  | quiz                         | result                      |
 * | ---------- | ---------------------------- | --------------------------- |
 * | admin      | any                          | allowed                     |
 * | instructor | course-bound, manages course | allowed                     |
 * | instructor | course-bound, otherwise      | 403 QUIZ_FORBIDDEN          |
 * | instructor | STANDALONE, is the author    | allowed                     |
 * | instructor | STANDALONE, otherwise        | 403 QUIZ_FORBIDDEN          |
 * | anyone     | id unknown or malformed      | 403 QUIZ_FORBIDDEN          |
 * | other role | any                          | 403 FORBIDDEN_RESOURCE      |
 *
 * Every denial on an existing quiz answers exactly like an unknown id (admins
 * included), so ids, scopes and ownership cannot be probed.
 */
@Injectable()
export class QuizAuthorizationGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: QuizCourseResolverService,
    private readonly ownership: CourseOwnershipService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<QuizAuthorizationRequest>();
    const principal = request.principal;
    if (!principal?.roles.some((role) => AUTHORING_ROLES.includes(role)))
      throw new ForbiddenException(FORBIDDEN_RESOURCE);

    const quizId = await this.quizIdFrom(
      request.params as Record<string, string | undefined>,
    );
    const quiz = quizId
      ? await this.dataSource.getRepository(QuizEntity).findOne({
          where: { id: quizId },
          select: {
            id: true,
            scope: true,
            targetId: true,
            status: true,
            createdBy: true,
          },
        })
      : null;
    if (!quiz) throw new ForbiddenException(QUIZ_FORBIDDEN);

    const decision = await this.decide(principal, quiz);
    if ('denied' in decision) throw new ForbiddenException(QUIZ_FORBIDDEN);
    request.quiz = decision.quiz;
    return true;
  }

  /**
   * The quiz with its resolved Course when the principal may manage it, else
   * null. Also used outside HTTP guards, e.g. for author previews.
   */
  async authorize(
    principal: Pick<Principal, 'id' | 'roles'>,
    quiz: Omit<AuthorizedQuiz, 'courseId'>,
  ): Promise<AuthorizedQuiz | null> {
    const decision = await this.decide(principal, quiz);
    return 'quiz' in decision ? decision.quiz : null;
  }

  private async decide(
    principal: Pick<Principal, 'id' | 'roles'>,
    quiz: Omit<AuthorizedQuiz, 'courseId'>,
  ): Promise<QuizAuthorization> {
    const isAdmin = principal.roles.includes('admin');
    if (quiz.scope === QuizScope.STANDALONE)
      return isAdmin || quiz.createdBy === principal.id
        ? { quiz: { ...quiz, courseId: null } }
        : { denied: true };

    let courseId: string | null;
    try {
      courseId = await this.resolver.resolveCourseIdByQuiz(quiz);
    } catch (error) {
      // A dangling target (archived quiz whose target was deleted) has no
      // Course authority left; only an admin may still manage it.
      if (!(error instanceof QuizTargetNotFoundError)) throw error;
      return isAdmin ? { quiz: { ...quiz, courseId: null } } : { denied: true };
    }
    return (await this.ownership.canManageCourse(principal, courseId))
      ? { quiz: { ...quiz, courseId } }
      : { denied: true };
  }

  /** Null for a missing, malformed or unknown id. */
  private async quizIdFrom(params: Record<string, string | undefined>) {
    const valid = (id: string | undefined) =>
      id !== undefined && isUUID(id) ? id : null;
    const direct = params.quizId ?? params.id;
    if (direct !== undefined) return valid(direct);

    const questionId = valid(params.questionId);
    if (questionId) {
      const [row] = await this.dataSource.query<Array<{ quizId: string }>>(
        'SELECT quiz_id AS "quizId" FROM quiz_questions WHERE id = $1',
        [questionId],
      );
      return row?.quizId ?? null;
    }
    const optionId = valid(params.optionId);
    if (optionId) {
      const [row] = await this.dataSource.query<Array<{ quizId: string }>>(
        `SELECT question.quiz_id AS "quizId"
         FROM quiz_options option
         INNER JOIN quiz_questions question ON question.id = option.question_id
         WHERE option.id = $1`,
        [optionId],
      );
      return row?.quizId ?? null;
    }
    return null;
  }
}
