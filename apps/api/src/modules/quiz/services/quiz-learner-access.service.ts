import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { CourseAccessService } from '../../../courses/course-access.service.js';
import { rejectLessonAccess } from '../../lessons/guards/lesson-access.guard.js';
import { QuizEntity, QuizScope, QuizStatus } from '../entities/quiz.entity.js';
import { QuizAuthorizationGuard } from '../guards/quiz-authorization.guard.js';
import {
  QuizCourseResolverService,
  QuizTargetNotFoundError,
} from './quiz-course-resolver.service.js';

export const QUIZ_NOT_FOUND = {
  statusCode: 404,
  message: 'QUIZ_NOT_FOUND',
  code: 'QUIZ_NOT_FOUND',
};
export const quizForbidden = (code: string, extra: object = {}) =>
  new ForbiddenException({ statusCode: 403, message: code, code, ...extra });

// Learner routes never distinguish a draft, archived or missing quiz.
export const QUIZ_FORBIDDEN = 'QUIZ_FORBIDDEN';
// Any scope access denial; `reason` says which rule failed.
export const TARGET_COURSE_FORBIDDEN = 'TARGET_COURSE_FORBIDDEN';

type CourseEnrollmentRow = {
  status: string;
  enrolled: boolean;
  revoked: boolean;
};

/** Who may take (or keep working on) a quiz as a learner. */
@Injectable()
export class QuizLearnerAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: QuizCourseResolverService,
    private readonly authorization: QuizAuthorizationGuard,
    private readonly courseAccess: CourseAccessService,
  ) {}

  /** Any status: an attempt already running may finish after archival. */
  async loadQuiz(quizId: string, manager?: EntityManager) {
    const quiz = await (manager ?? this.dataSource.manager)
      .getRepository(QuizEntity)
      .findOneBy({ id: quizId });
    if (!quiz) throw quizForbidden(QUIZ_FORBIDDEN);
    return quiz;
  }

  /**
   * Drafts and archived quizzes are indistinguishable from missing ones. With
   * `lock`, the row is held FOR SHARE until the caller's transaction ends, so
   * no publish, new version or question edit can interleave.
   */
  async loadPublishedQuiz(
    quizId: string,
    manager?: EntityManager,
    lock = false,
  ) {
    const quiz = await (manager ?? this.dataSource.manager)
      .getRepository(QuizEntity)
      .findOne({
        where: { id: quizId },
        ...(lock && { lock: { mode: 'pessimistic_read' as const } }),
      });
    if (!quiz || quiz.status !== QuizStatus.PUBLISHED)
      throw quizForbidden(QUIZ_FORBIDDEN);
    return quiz;
  }

  /**
   * Scope access resolution, one rule set for all four scopes:
   * - course staff and admins preview everything;
   * - STANDALONE: any signed-in user (published standalone quizzes are
   *   public to the community, see GET /quizzes/standalone);
   * - LESSON: the lesson gate (published lesson, active enrollment, and
   *   sequential prerequisites, reported as PREREQUISITE_LESSON_NOT_COMPLETED);
   * - CHAPTER and COURSE: published course and active enrollment.
   * Every other denial is 403 TARGET_COURSE_FORBIDDEN with a `reason`.
   */
  async assertCanTake(
    principal: Principal,
    quiz: Pick<
      QuizEntity,
      'id' | 'scope' | 'targetId' | 'status' | 'createdBy'
    >,
  ) {
    if (await this.authorization.authorize(principal, quiz)) return;
    if (quiz.scope === QuizScope.STANDALONE) return;

    if (quiz.scope === QuizScope.LESSON) {
      const access = await this.courseAccess.canAccessLesson(
        principal.id,
        quiz.targetId!,
        { allowPreview: false },
      );
      if (access.granted) return;
      if (access.reason === 'PREREQUISITE_LESSON_NOT_COMPLETED')
        rejectLessonAccess(access);
      throw targetForbidden(
        access.reason === 'ENROLLMENT_SUSPENDED'
          ? 'ENROLLMENT_SUSPENDED'
          : access.reason === 'ENROLLMENT_REQUIRED'
            ? 'ENROLLMENT_REQUIRED'
            : 'TARGET_UNAVAILABLE',
      );
    }

    let courseId: string | null;
    try {
      courseId = await this.resolver.resolveCourseIdByQuiz(quiz);
    } catch (error) {
      if (error instanceof QuizTargetNotFoundError)
        throw targetForbidden('TARGET_UNAVAILABLE');
      throw error;
    }
    const [course] = await this.dataSource.query<CourseEnrollmentRow[]>(
      `SELECT course.status,
         enrollment.user_id IS NOT NULL AS enrolled,
         enrollment.revoked_at IS NOT NULL AS revoked
       FROM courses course
       LEFT JOIN enrollments enrollment
         ON enrollment.course_id = course.id AND enrollment.user_id = $2
       WHERE course.id = $1`,
      [courseId, principal.id],
    );
    if (!course || course.status !== 'published')
      throw targetForbidden('TARGET_UNAVAILABLE');
    if (!course.enrolled) throw targetForbidden('ENROLLMENT_REQUIRED');
    if (course.revoked) throw targetForbidden('ENROLLMENT_SUSPENDED');
  }
}

const targetForbidden = (reason: string) =>
  quizForbidden(TARGET_COURSE_FORBIDDEN, { reason });
