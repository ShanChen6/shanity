import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  EssaySubmissionType,
  QuestionType,
} from '../domain/assessment.types.js';
import { CreateQuestionDto } from './quiz-question-authoring.dto.js';

const validationOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
} as const;

async function errors(payload: object) {
  return validate(
    plainToInstance(CreateQuestionDto, payload),
    validationOptions,
  );
}

function messages(validationErrors: Awaited<ReturnType<typeof errors>>) {
  const collect = (items: typeof validationErrors): string[] =>
    items.flatMap((error) => [
      ...Object.values(error.constraints ?? {}),
      ...collect(error.children ?? []),
    ]);
  return collect(validationErrors);
}

describe('CreateQuestionDto essay validation', () => {
  it('accepts a MULTIPLE_CHOICE question with at least two valid options', async () => {
    await expect(
      errors({
        content: 'Select every prime number.',
        type: QuestionType.MULTIPLE_CHOICE,
        options: [
          { content: '2', isCorrect: true },
          { content: '4', isCorrect: false },
        ],
      }),
    ).resolves.toEqual([]);
  });

  it('rejects a MULTIPLE_CHOICE question without options', async () => {
    const result = await errors({
      content: 'Select every prime number.',
      type: QuestionType.MULTIPLE_CHOICE,
    });

    expect(messages(result)).toContain(
      'options are required for MULTIPLE_CHOICE questions',
    );
  });

  it('accepts an ESSAY question with both submission modes and a rubric', async () => {
    const dto = plainToInstance(CreateQuestionDto, {
      content: 'Prove the stated identity.',
      type: QuestionType.ESSAY,
      essayConfig: {
        allowedSubmissionTypes: [
          EssaySubmissionType.TEXT_WITH_KATEX,
          EssaySubmissionType.FILE_UPLOAD,
        ],
        maxWords: 800,
        rubric: [
          {
            criterion: 'Correct derivation',
            maxPoints: 8,
            description: 'Every transformation must be justified.',
          },
          { criterion: 'Presentation', maxPoints: 2 },
        ],
      },
    });

    await expect(validate(dto, validationOptions)).resolves.toEqual([]);
    expect(dto.essayConfig?.maxFileUploads).toBe(3);
  });

  it.each([
    {
      name: 'an empty allowedSubmissionTypes array',
      allowedSubmissionTypes: [],
      expected: 'allowedSubmissionTypes must contain at least one item',
    },
    {
      name: 'an unknown submission type',
      allowedSubmissionTypes: ['VOICE_NOTE'],
      expected:
        'each allowedSubmissionTypes value must be TEXT_WITH_KATEX or FILE_UPLOAD',
    },
  ])(
    'rejects an ESSAY question with $name',
    async ({ allowedSubmissionTypes, expected }) => {
      const result = await errors({
        content: 'Explain your solution.',
        type: QuestionType.ESSAY,
        essayConfig: { allowedSubmissionTypes },
      });

      expect(messages(result)).toContain(expected);
    },
  );
});
