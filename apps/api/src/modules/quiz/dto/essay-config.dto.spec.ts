import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  EssaySubmissionType,
  QuestionType,
  type EssayConfig,
} from '../domain/assessment.types.js';
import type { QuizQuestionEntity } from '../entities/quiz-question.entity.js';
import { CreateQuestionDto } from './quiz-question-authoring.dto.js';
import {
  InstructorQuestionResponseDto,
  LearnerQuestionResponseDto,
} from './quiz-question-response.dto.js';

const validationOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
} as const;

const base = {
  content: 'Explain the JavaScript event loop.',
  type: QuestionType.ESSAY,
  maxScore: 5,
  essayConfig: {
    allowedSubmissionTypes: [EssaySubmissionType.TEXT_WITH_KATEX],
  },
};

const messages = (errors: ValidationError[]): string[] =>
  errors.flatMap((error) => [
    ...Object.values(error.constraints ?? {}),
    ...messages(error.children ?? []),
  ]);

async function validateQuestion(payload: object) {
  return validate(
    plainToInstance(CreateQuestionDto, payload),
    validationOptions,
  );
}

describe('Essay grading guide and rubric validation', () => {
  it('accepts simple mode with a grading guide and maxScore 5', async () => {
    await expect(
      validateQuestion({
        ...base,
        essayConfig: {
          ...base.essayConfig,
          gradingGuide: 'Award points for a correct, clearly explained flow.',
        },
      }),
    ).resolves.toEqual([]);
  });

  it('accepts a five-criterion rubric totaling maxScore 5', async () => {
    await expect(
      validateQuestion({
        ...base,
        essayConfig: {
          ...base.essayConfig,
          rubric: [
            { criterion: 'Call Stack', maxPoints: 1 },
            { criterion: 'Event Loop', maxPoints: 1 },
            { criterion: 'Task Queue', maxPoints: 1 },
            { criterion: 'Microtask Queue', maxPoints: 1 },
            { criterion: 'Example', maxPoints: 1 },
          ],
        },
      }),
    ).resolves.toEqual([]);
  });

  it('rejects a rubric totaling 4 when maxScore is 5', async () => {
    const errors = await validateQuestion({
      ...base,
      essayConfig: {
        ...base.essayConfig,
        rubric: [
          { criterion: 'Call Stack', maxPoints: 1 },
          { criterion: 'Event Loop', maxPoints: 1 },
          { criterion: 'Task Queue', maxPoints: 1 },
          { criterion: 'Example', maxPoints: 1 },
        ],
      },
    });

    expect(messages(errors)).toContain(
      'Total points of rubric criteria (4) must equal question max score (5)',
    );
  });

  it('shows grading data to instructors and redacts it from learner view', () => {
    const essayConfig: EssayConfig = {
      allowedSubmissionTypes: [EssaySubmissionType.TEXT_WITH_KATEX],
      maxFileUploads: 3,
      maxWords: 500,
      gradingGuide: 'Internal marking notes',
      rubric: [{ criterion: 'Reasoning', maxPoints: 5 }],
    };
    const question = {
      id: 'question-id',
      quizId: 'quiz-id',
      type: QuestionType.ESSAY,
      content: 'Explain your answer.',
      position: 1,
      points: 5,
      essayConfig,
      explanation: null,
      options: [],
      createdAt: new Date('2026-10-08T00:00:00.000Z'),
      updatedAt: new Date('2026-10-08T00:00:00.000Z'),
    } as unknown as QuizQuestionEntity;

    expect(InstructorQuestionResponseDto.from(question).essayConfig).toEqual(
      essayConfig,
    );
    expect(LearnerQuestionResponseDto.from(question).essayConfig).toStrictEqual(
      {
        allowedSubmissionTypes: [EssaySubmissionType.TEXT_WITH_KATEX],
        maxFileUploads: 3,
        maxWords: 500,
      },
    );
  });
});
