import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import { CourseAccessService } from '../../../courses/course-access.service.js';
import { rejectLessonAccess } from '../../lessons/guards/lesson-access.guard.js';
import {
  InstructorQuestionResponseDto,
  LearnerQuizResponseDto,
} from '../dto/quiz-question-response.dto.js';
import { QuizEntity, QuizScope, QuizStatus } from '../entities/quiz.entity.js';
import { QuizQuestionEntity } from '../entities/quiz-question.entity.js';
import { QuizAuthorizationGuard } from '../guards/quiz-authorization.guard.js';
import {
  QuizCourseResolverService,
  QuizTargetNotFoundError,
} from './quiz-course-resolver.service.js';

const QUIZ_NOT_FOUND = {
  statusCode: 404,
  message: 'QUIZ_NOT_FOUND',
  code: 'QUIZ_NOT_FOUND',
};
const forbidden = (code: string) =>
  new ForbiddenException({ statusCode: 403, message: code, code });

type CourseEnrollmentRow = {
  status: string;
  enrolled: boolean;
  revoked: boolean;
};

@Injectable()
export class QuizQuestionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly resolver: QuizCourseResolverService,
    private readonly authorization: QuizAuthorizationGuard,
    private readonly courseAccess: CourseAccessService,
  ) {}

  /** Authoring view; the caller must already have passed QuizAuthorizationGuard. */
  async listForInstructor(quizId: string) {
    const questions = await this.dataSource
      .getRepository(QuizQuestionEntity)
      .find({
        where: { quizId },
        relations: { options: true },
        order: {
          position: 'ASC',
          id: 'ASC',
          options: { position: 'ASC', id: 'ASC' },
        },
      });
    return questions.map((question) =>
      InstructorQuestionResponseDto.from(question),
    );
  }

  /**
   * The quiz as a learner takes it. The answer key and explanations are never
   * selected from the database, and the DTO copies an allow-list on top.
   */
  async getForLearner(principal: Principal, quizId: string) {
    const quiz = await this.dataSource.getRepository(QuizEntity).findOne({
      where: { id: quizId },
      select: {
        id: true,
        title: true,
        description: true,
        durationMinutes: true,
        passingScore: true,
        scope: true,
        targetId: true,
        status: true,
        createdBy: true,
      },
    });
    // Drafts and archived quizzes are indistinguishable from missing ones.
    if (!quiz || quiz.status !== QuizStatus.PUBLISHED)
      throw new NotFoundException(QUIZ_NOT_FOUND);
    await this.assertCanTake(principal, quiz);

    const questions = await this.dataSource
      .getRepository(QuizQuestionEntity)
      .find({
        where: { quizId },
        relations: { options: true },
        select: {
          id: true,
          type: true,
          content: true,
          position: true,
          points: true,
          options: { id: true, content: true, position: true },
        },
        order: {
          position: 'ASC',
          id: 'ASC',
          options: { position: 'ASC', id: 'ASC' },
        },
      });
    return LearnerQuizResponseDto.from(quiz, questions);
  }

  private async assertCanTake(principal: Principal, quiz: QuizEntity) {
    // Authors, course instructors and admins may preview the learner view.
    if (await this.authorization.authorize(principal, quiz)) return;
    // Standalone access needs an explicit grant, which is not modelled yet.
    if (quiz.scope === QuizScope.STANDALONE)
      throw forbidden('QUIZ_NOT_AVAILABLE');

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
        throw forbidden('QUIZ_NOT_AVAILABLE');
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
      throw forbidden('COURSE_UNAVAILABLE');
    if (!course.enrolled) throw forbidden('ENROLLMENT_REQUIRED');
    if (course.revoked) throw forbidden('ENROLLMENT_SUSPENDED');
  }
}
