import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CurriculumEvents } from '../../curriculum/curriculum-events.js';
import { QuizEntity, QuizStatus } from '../entities/quiz.entity.js';
import { QUIZ_NOT_FOUND } from './quiz-learner-access.service.js';
import {
  QuizPublishValidationPipeline,
  type QuizPublishIssue,
} from './quiz-publish-validation.pipeline.js';

const conflict = (code: string) =>
  new ConflictException({ statusCode: 409, message: code, code });

/**
 * DRAFT -> PUBLISHED, only through the quality gate. The quiz row is locked
 * FOR UPDATE for the whole check-and-flip, and question/option authoring
 * takes the same lock, so no edit can slip between validation and publish
 * and concurrent publishes queue: the first wins, the rest see PUBLISHED.
 */
@Injectable()
export class QuizPublishingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pipeline: QuizPublishValidationPipeline,
    private readonly curriculum: CurriculumEvents,
  ) {}

  /** Callers must have passed QuizAuthorizationGuard. */
  async publish(quizId: string, courseId: string | null) {
    const result = await this.dataSource.transaction(
      async (
        manager,
      ): Promise<
        { published: QuizEntity } | { issues: QuizPublishIssue[] }
      > => {
        const quiz = await manager.getRepository(QuizEntity).findOne({
          where: { id: quizId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!quiz) throw new NotFoundException(QUIZ_NOT_FOUND);
        if (quiz.status === QuizStatus.PUBLISHED)
          throw conflict('QUIZ_ALREADY_PUBLISHED');
        // Only DRAFT -> PUBLISHED; archived quizzes are not republished here.
        if (quiz.status !== QuizStatus.DRAFT) throw conflict('QUIZ_NOT_DRAFT');

        const issues = await this.pipeline.validate(quiz, manager);
        if (issues.length) return { issues };

        await manager.getRepository(QuizEntity).update(quizId, {
          status: QuizStatus.PUBLISHED,
          publishedAt: () => 'now()',
          updatedAt: () => 'now()',
        });
        return {
          published: await manager
            .getRepository(QuizEntity)
            .findOneByOrFail({ id: quizId }),
        };
      },
    );

    if ('issues' in result)
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'QUIZ_NOT_PUBLISHABLE',
        code: 'QUIZ_NOT_PUBLISHABLE',
        issues: result.issues,
      });
    // A published course-bound quiz now counts towards progress/completion.
    if (courseId)
      this.curriculum.emitChanged({
        courseId,
        source: 'POST /admin/quizzes/:id/publish',
      });
    const { id, title, version, status, publishedAt } = result.published;
    return { id, title, version, status, publishedAt };
  }
}
