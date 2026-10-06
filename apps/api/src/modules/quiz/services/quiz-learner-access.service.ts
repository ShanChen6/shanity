import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
export const quizForbidden = (code: string) =>
  new ForbiddenException({ statusCode: 403, message: code, code });

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
    if (!quiz) throw new NotFoundException(QUIZ_NOT_FOUND);
    return quiz;
  }

  /** Drafts and archived quizzes are indistinguishable from missing ones. */
  async loadPublishedQuiz(quizId: string, manager?: EntityManager) {
    const quiz = await this.loadQuiz(quizId, manager);
    if (quiz.status !== QuizStatus.PUBLISHED)
      throw new NotFoundException(QUIZ_NOT_FOUND);
    return quiz;
  }

  async assertCanTake(
    principal: Principal,
    quiz: Pick<
      QuizEntity,
      'id' | 'scope' | 'targetId' | 'status' | 'createdBy'
    >,
  ) {
    // Authors, course instructors and admins may preview the learner view.
    if (await this.authorization.authorize(principal, quiz)) return;
    // Standalone access needs an explicit grant, which is not modelled yet.
    if (quiz.scope === QuizScope.STANDALONE)
      throw quizForbidden('QUIZ_NOT_AVAILABLE');

    if (quiz.scope === QuizScope.LESSON) {
      const access = await this.courseAccess.canAccessLesson(
        principal.id,
        quiz.targetId!,
        { allowPreview: false },
      );
      if (!access.granted) rejectLessonAccess(access);
      return;
    }

    let courseId: string | null;
    try {
      courseId = await this.resolver.resolveCourseIdByQuiz(quiz);
    } catch (error) {
      if (error instanceof QuizTargetNotFoundError)
        throw quizForbidden('QUIZ_NOT_AVAILABLE');
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
      throw quizForbidden('COURSE_UNAVAILABLE');
    if (!course.enrolled) throw quizForbidden('ENROLLMENT_REQUIRED');
    if (course.revoked) throw quizForbidden('ENROLLMENT_SUSPENDED');
  }
}
