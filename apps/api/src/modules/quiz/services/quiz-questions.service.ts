import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../../../auth/auth.service.js';
import {
  InstructorQuestionResponseDto,
  LearnerQuizResponseDto,
} from '../dto/quiz-question-response.dto.js';
import { QuizQuestionEntity } from '../entities/quiz-question.entity.js';
import { QuizLearnerAccessService } from './quiz-learner-access.service.js';

@Injectable()
export class QuizQuestionsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: QuizLearnerAccessService,
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
    const quiz = await this.access.loadPublishedQuiz(quizId);
    await this.access.assertCanTake(principal, quiz);

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
          essayConfig: true,
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
}
