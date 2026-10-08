import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { SubmitQuizDto } from './quiz-attempt.dto.js';

const validationOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  validationError: { target: false, value: false },
} as const;

const questionId = '123e4567-e89b-42d3-a456-426614174000';

async function errors(payload: object) {
  return validate(plainToInstance(SubmitQuizDto, payload), validationOptions);
}

function messages(items: Awaited<ReturnType<typeof errors>>): string[] {
  return items.flatMap((item) => [
    ...Object.values(item.constraints ?? {}),
    ...messages(item.children ?? []),
  ]);
}

describe('SubmitQuizDto mixed response validation', () => {
  it('accepts an Essay response with text and HTTPS attachments', async () => {
    await expect(
      errors({
        answers: [
          {
            questionId,
            essayAnswer: {
              text: 'Use $F = ma$.',
              attachments: [
                {
                  url: 'https://cdn.example.com/work/answer.png',
                  filename: 'answer.png',
                  mimeType: 'image/png',
                  size: 2048,
                },
              ],
            },
          },
        ],
      }),
    ).resolves.toEqual([]);
  });

  it('rejects an Essay response with neither text nor attachments', async () => {
    expect(
      messages(await errors({ answers: [{ questionId, essayAnswer: {} }] })),
    ).toContain(
      'essayAnswer must contain non-empty text or at least one attachment',
    );
  });

  it('rejects a non-HTTPS attachment URL', async () => {
    expect(
      messages(
        await errors({
          answers: [
            {
              questionId,
              essayAnswer: {
                attachments: [
                  {
                    url: 'javascript:alert(1)',
                    filename: 'answer.png',
                    mimeType: 'image/png',
                    size: 2048,
                  },
                ],
              },
            },
          ],
        }),
      ),
    ).toContain('attachment url must be a valid HTTPS URL');
  });

  it('requires at least one option ID for a submitted MCQ answer', async () => {
    expect(
      messages(
        await errors({
          answers: [{ questionId, selectedOptionIds: [] }],
        }),
      ),
    ).toContain('selectedOptionIds must contain at least 1 elements');
  });
});
