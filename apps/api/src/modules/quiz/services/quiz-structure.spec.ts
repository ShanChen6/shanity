import { describe, expect, it } from 'vitest';
import { QuizQuestionType } from '../entities/quiz-question.entity.js';
import { validateQuizStructure } from './quiz-structure.js';

const question = (
  id: string,
  correct: boolean[],
  type = QuizQuestionType.SINGLE_CHOICE,
  points = 10,
) => ({
  id,
  type,
  points,
  options: correct.map((isCorrect) => ({ isCorrect })),
});

describe('validateQuizStructure', () => {
  it('accepts complete single and multiple choice questions', () => {
    expect(
      validateQuizStructure([
        question('q1', [true, false]),
        question('q2', [true, true, false], QuizQuestionType.MULTIPLE_CHOICE),
      ]),
    ).toEqual({ valid: true, issues: [] });
  });

  it('requires at least one question', () => {
    expect(validateQuizStructure([])).toEqual({
      valid: false,
      issues: [{ code: 'QUIZ_HAS_NO_QUESTIONS' }],
    });
  });

  it('reports every incomplete question at once', () => {
    expect(
      validateQuizStructure([
        question('few', [true]),
        question('none', [false, false]),
        question('empty', []),
        question('double', [true, true]),
        question('all', [true, true], QuizQuestionType.MULTIPLE_CHOICE),
        question('free', [true, false], QuizQuestionType.SINGLE_CHOICE, 0),
      ]).issues,
    ).toEqual([
      { code: 'QUESTION_NEEDS_TWO_OPTIONS', questionId: 'few' },
      { code: 'QUESTION_MISSING_CORRECT_OPTION', questionId: 'none' },
      { code: 'QUESTION_NEEDS_TWO_OPTIONS', questionId: 'empty' },
      { code: 'QUESTION_MISSING_CORRECT_OPTION', questionId: 'empty' },
      { code: 'SINGLE_CHOICE_HAS_MULTIPLE_CORRECT', questionId: 'double' },
      { code: 'MULTIPLE_CHOICE_NEEDS_INCORRECT_OPTION', questionId: 'all' },
      { code: 'INVALID_QUESTION_POINTS', questionId: 'free' },
    ]);
  });

  it('rejects non-positive and fractional points', () => {
    for (const points of [0, -5, 1.5])
      expect(
        validateQuizStructure([
          question('q', [true, false], QuizQuestionType.SINGLE_CHOICE, points),
        ]).issues,
      ).toEqual([{ code: 'INVALID_QUESTION_POINTS', questionId: 'q' }]);
  });
});
