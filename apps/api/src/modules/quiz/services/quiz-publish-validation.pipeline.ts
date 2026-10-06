import { BadRequestException, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { QuizEntity, ReviewPolicy } from '../entities/quiz.entity.js';
import { QuizQuestionEntity } from '../entities/quiz-question.entity.js';
import { validateQuizStructure } from './quiz-structure.js';
import { QuizTargetValidationService } from './quiz-target-validation.service.js';

export type QuizPublishIssue = { code: string; questionId?: string };

/**
 * The publish quality gate. Runs the whole checklist in order and returns
 * every violation (empty = publishable), reading through the publish
 * transaction's manager so it judges exactly the rows that transaction locks:
 *
 * 1. target: scope/target binding still valid;
 * 2-5. questions and options (see validateQuizStructure), points > 0;
 * 5. passingScore within 1..100;
 * 6. maxAttempts and durationMinutes null or a positive integer, and a
 *    finite maxAttempts when details are only revealed AFTER_EXHAUSTED.
 *
 * Several of these are also database CHECKs; they are repeated so the gate
 * stays complete on its own and reports them as issues, not 500s.
 */
@Injectable()
export class QuizPublishValidationPipeline {
  constructor(private readonly targets: QuizTargetValidationService) {}

  async validate(
    quiz: QuizEntity,
    manager: EntityManager,
  ): Promise<QuizPublishIssue[]> {
    const issues: QuizPublishIssue[] = [];

    try {
      await this.targets.validate(quiz.scope, quiz.targetId, manager);
    } catch (error) {
      if (!(error instanceof BadRequestException)) throw error;
      const { code } = error.getResponse() as { code: string };
      issues.push({ code });
    }

    const questions = await manager.getRepository(QuizQuestionEntity).find({
      where: { quizId: quiz.id },
      relations: { options: true },
      select: {
        id: true,
        type: true,
        points: true,
        position: true,
        options: { id: true, isCorrect: true },
      },
      order: { position: 'ASC', id: 'ASC' },
    });
    issues.push(...validateQuizStructure(questions).issues);

    if (
      !Number.isInteger(quiz.passingScore) ||
      quiz.passingScore < 1 ||
      quiz.passingScore > 100
    )
      issues.push({ code: 'INVALID_PASSING_SCORE' });
    if (!isPositiveIntegerOrNull(quiz.maxAttempts))
      issues.push({ code: 'INVALID_MAX_ATTEMPTS' });
    if (!isPositiveIntegerOrNull(quiz.durationMinutes))
      issues.push({ code: 'INVALID_DURATION_MINUTES' });
    // Unlimited attempts are never exhausted: details would never be shown.
    if (
      quiz.reviewPolicy === ReviewPolicy.AFTER_EXHAUSTED &&
      quiz.maxAttempts === null
    )
      issues.push({ code: 'REVIEW_POLICY_REQUIRES_MAX_ATTEMPTS' });
    return issues;
  }
}

const isPositiveIntegerOrNull = (value: number | null) =>
  value === null || (Number.isInteger(value) && value >= 1);
