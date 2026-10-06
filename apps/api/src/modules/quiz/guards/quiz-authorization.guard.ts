import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import type { AuthRequest } from '../../../auth/auth.guards.js';
import type { Principal } from '../../../auth/auth.service.js';
import { QuizEntity, QuizScope } from '../entities/quiz.entity.js';
import {
  QuizCourseResolverService,
  QuizTargetNotFoundError,
} from '../services/quiz-course-resolver.service.js';

export const QUIZ_FORBIDDEN = {
  statusCode: 403,
  message: 'QUIZ_FORBIDDEN',
  code: 'QUIZ_FORBIDDEN',
};

export type AuthorizedQuiz = Pick<
  QuizEntity,
  'id' | 'scope' | 'targetId' | 'status' | 'createdBy'
> & {
  // Null for STANDALONE, or when a contextual target no longer resolves.
  courseId: string | null;
};
export type QuizAuthorizationRequest = AuthRequest & { quiz?: AuthorizedQuiz };

/**
 * Gate for instructor edit/delete on a quiz (`:quizId`, falling back to `:id`).
 * Runs after SessionGuard.
 *
 * - admin: any quiz.
 * - contextual quiz: instructors who own, teach or are assigned to the Course
 *   resolved from the quiz target.
 * - STANDALONE quiz: only its author (`created_by`).
 *
 * A missing quiz answers 403 to non-admins so ids cannot be probed.
 */
@Injectable()
export class QuizAuthorizationGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: QuizCourseResolverService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<QuizAuthorizationRequest>();
    const principal = request.principal;
    if (!principal) throw new ForbiddenException(QUIZ_FORBIDDEN);
    const isAdmin = principal.roles.includes('admin');
    const params = request.params as Record<string, string | undefined>;
    const quizId = params.quizId ?? params.id;

    const quiz =
      quizId && isUUID(quizId)
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
    if (!quiz) {
      if (isAdmin) throw new NotFoundException('Quiz not found');
      throw new ForbiddenException(QUIZ_FORBIDDEN);
    }

    const authorized = await this.authorize(principal, quiz);
    if (!authorized) throw new ForbiddenException(QUIZ_FORBIDDEN);
    request.quiz = authorized;
    return true;
  }

  /** The quiz with its resolved Course when the principal may manage it. */
  async authorize(
    principal: Pick<Principal, 'id' | 'roles'>,
    quiz: Omit<AuthorizedQuiz, 'courseId'>,
  ): Promise<AuthorizedQuiz | null> {
    const isAdmin = principal.roles.includes('admin');
    if (quiz.scope === QuizScope.STANDALONE)
      return isAdmin || quiz.createdBy === principal.id
        ? { ...quiz, courseId: null }
        : null;

    let courseId: string | null;
    try {
      courseId = await this.resolver.resolveCourseIdByQuiz(quiz);
    } catch (error) {
      // A dangling target (archived quiz whose target was deleted) has no
      // Course authority left; only an admin may still manage it.
      if (!(error instanceof QuizTargetNotFoundError)) throw error;
      return isAdmin ? { ...quiz, courseId: null } : null;
    }
    if (isAdmin) return { ...quiz, courseId };
    if (!principal.roles.includes('instructor')) return null;
    return (await this.teachesCourse(principal.id, courseId))
      ? { ...quiz, courseId }
      : null;
  }

  private async teachesCourse(userId: string, courseId: string | null) {
    if (!courseId) return false;
    const [row] = await this.dataSource.query<Array<{ allowed: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM courses course
         WHERE course.id = $1
           AND ($2 IN (course.owner_id, course.instructor_id)
             OR EXISTS (
               SELECT 1 FROM course_instructors assignment
               WHERE assignment.course_id = course.id
                 AND assignment.user_id = $2
             ))
       ) AS allowed`,
      [courseId, userId],
    );
    return row?.allowed === true;
  }
}
