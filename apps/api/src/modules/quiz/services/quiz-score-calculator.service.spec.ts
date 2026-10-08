import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { QuizAttemptSnapshot } from './quiz-attempt-snapshot.js';
import {
  calculateFinalScore,
  calculateScore,
  percentHundredths,
  QuizScoreCalculatorService,
  toBreakdownDto,
  UNREVIEWED_ESSAYS_MESSAGE,
  type StoredAnswer,
} from './quiz-score-calculator.service.js';

type Spec = { id: string; type: 'MCQ' | 'ESSAY'; points: number };

/** Builds a snapshot; every MCQ has options `<id>-right` and `<id>-wrong`. */
function snapshot(questions: Spec[], passingScore = 80): QuizAttemptSnapshot {
  return {
    schemaVersion: 2,
    quiz: { passingScore, courseId: null },
    questions: questions.map((question, index) => ({
      id: question.id,
      type: question.type === 'ESSAY' ? 'ESSAY' : 'MULTIPLE_CHOICE',
      content: question.id,
      position: index + 1,
      points: question.points,
      explanation: null,
      essayConfig: null,
      options:
        question.type === 'ESSAY'
          ? []
          : [
              {
                id: `${question.id}-right`,
                content: 'right',
                position: 1,
                isCorrect: true,
              },
              {
                id: `${question.id}-wrong`,
                content: 'wrong',
                position: 2,
                isCorrect: false,
              },
            ],
    })),
  } as unknown as QuizAttemptSnapshot;
}

const right = (id: string): StoredAnswer => ({
  questionId: id,
  selectedOptionIds: [`${id}-right`],
});
const wrong = (id: string): StoredAnswer => ({
  questionId: id,
  selectedOptionIds: [`${id}-wrong`],
});
const graded = (id: string, awardedPoints: number): StoredAnswer => ({
  questionId: id,
  selectedOptionIds: [],
  grading: { status: 'GRADED', awardedPoints },
});
const ungraded = (id: string): StoredAnswer => ({
  questionId: id,
  selectedOptionIds: [],
  grading: { status: 'UNGRADED', awardedPoints: null },
});

describe('QuizScoreCalculatorService', () => {
  // MCQ 18/20 (two questions: 10 + 10 would give 20, so 9 + 9 right of 10 + 10
  // is not possible: use 18-point and 2-point questions), Essays 4/5 and 3/5.
  const exam = snapshot([
    { id: 'm1', type: 'MCQ', points: 18 },
    { id: 'm2', type: 'MCQ', points: 2 },
    { id: 'e1', type: 'ESSAY', points: 5 },
    { id: 'e2', type: 'ESSAY', points: 5 },
  ]);

  it('adds MCQ and essay points exactly: 18/20 + 4/5 + 3/5 = 25/30 = 83.33%', () => {
    const result = calculateFinalScore(exam, [
      right('m1'),
      wrong('m2'),
      graded('e1', 4),
      graded('e2', 3),
    ]);
    expect(result).toMatchObject({
      mcqScore: 18,
      mcqMaxScore: 20,
      essayScore: 7,
      essayMaxScore: 10,
      totalScore: 25,
      totalMaxScore: 30,
      percentage: 83.33,
      score: 83,
      isPassed: true,
      ungradedEssayCount: 0,
    });
    expect(
      result.essays.map(({ number, awardedPoints, maxScore }) => [
        number,
        awardedPoints,
        maxScore,
      ]),
    ).toEqual([
      [3, 4, 5],
      [4, 3, 5],
    ]);
  });

  it('refuses to finalize while an essay is still ungraded', () => {
    const answers = [right('m1'), right('m2'), graded('e1', 4), ungraded('e2')];
    expect(() => calculateFinalScore(exam, answers)).toThrow(
      UnprocessableEntityException,
    );
    expect(() => calculateFinalScore(exam, answers)).toThrow(
      UNREVIEWED_ESSAYS_MESSAGE,
    );
    // A missing answer row is as ungraded as an UNGRADED one.
    expect(() =>
      calculateFinalScore(exam, [right('m1'), graded('e1', 4)]),
    ).toThrow(UnprocessableEntityException);
    // The provisional score is still available, with the gap reported.
    expect(calculateScore(exam, answers)).toMatchObject({
      totalScore: 24,
      ungradedEssayCount: 1,
    });
  });

  it('rounds the percentage to two decimals, half up', () => {
    const third = snapshot([
      { id: 'a', type: 'MCQ', points: 1 },
      { id: 'b', type: 'MCQ', points: 1 },
      { id: 'c', type: 'MCQ', points: 1 },
    ]);
    expect(
      calculateScore(third, [right('a'), wrong('b'), wrong('c')]),
    ).toMatchObject({
      percentage: 33.33,
      score: 33,
    });
    expect(
      calculateScore(third, [right('a'), right('b'), wrong('c')]),
    ).toMatchObject({
      percentage: 66.67,
      score: 66,
    });
    // Exact halves go up: 1/8 = 12.5%, 1/16 = 6.25%, 1/32 = 3.125 -> 3.13.
    expect(percentHundredths(1, 8)).toBe(1250);
    expect(percentHundredths(1, 16)).toBe(625);
    expect(percentHundredths(1, 32)).toBe(313);
    expect(percentHundredths(0, 0)).toBe(0);
  });

  it('passes exactly at the pass mark and fails a hair below it', () => {
    const quiz = (passing: number) =>
      snapshot(
        [
          { id: 'a', type: 'MCQ', points: 4 },
          { id: 'b', type: 'MCQ', points: 1 },
        ],
        passing,
      );
    // 4/5 = 80%.
    expect(calculateScore(quiz(80), [right('a'), wrong('b')]).isPassed).toBe(
      true,
    );
    expect(calculateScore(quiz(81), [right('a'), wrong('b')]).isPassed).toBe(
      false,
    );
    // 83.33% >= 83 passes; < 84 fails.
    expect(
      calculateFinalScore(exam, [
        right('m1'),
        wrong('m2'),
        graded('e1', 4),
        graded('e2', 3),
      ]).isPassed,
    ).toBe(true);
    const strict = { ...exam, quiz: { ...exam.quiz, passingScore: 84 } };
    expect(
      calculateFinalScore(strict, [
        right('m1'),
        wrong('m2'),
        graded('e1', 4),
        graded('e2', 3),
      ]).isPassed,
    ).toBe(false);
  });

  it('never trusts stored points: partial MCQ selections score zero', () => {
    const multi = snapshot([{ id: 'm', type: 'MCQ', points: 5 }]);
    // Selecting a wrong option, or nothing, earns nothing.
    expect(calculateScore(multi, [wrong('m')]).totalScore).toBe(0);
    expect(calculateScore(multi, []).totalScore).toBe(0);
    expect(
      calculateScore(multi, [
        { questionId: 'm', selectedOptionIds: ['m-right', 'm-wrong'] },
      ]).totalScore,
    ).toBe(0);
  });

  it('caps an essay award at the question maximum and ignores negatives', () => {
    const essay = snapshot([{ id: 'e', type: 'ESSAY', points: 5 }]);
    expect(calculateFinalScore(essay, [graded('e', 99)]).essayScore).toBe(5);
    expect(calculateFinalScore(essay, [graded('e', -3)]).essayScore).toBe(0);
  });

  it('exposes the same numbers the learner sees in the breakdown', () => {
    const dto = toBreakdownDto(
      calculateFinalScore(exam, [
        right('m1'),
        wrong('m2'),
        {
          ...graded('e1', 4),
          grading: {
            status: 'GRADED',
            awardedPoints: 4,
            feedback: 'Good',
          } as never,
        },
        graded('e2', 3),
      ]),
    );
    expect(dto).toMatchObject({
      mcq: { score: 18, maxScore: 20 },
      essay: { score: 7, maxScore: 10 },
      total: { score: 25, maxScore: 30 },
      percentage: 83.33,
      isPassed: true,
    });
    expect(dto.essay.questions[0]).toMatchObject({
      number: 3,
      awardedPoints: 4,
      maxScore: 5,
      feedback: 'Good',
    });
  });

  it('is available on the injectable service as well', () => {
    const service = new QuizScoreCalculatorService(null as never);
    expect(
      service.calculateFinal(exam, [
        right('m1'),
        right('m2'),
        graded('e1', 5),
        graded('e2', 5),
      ]).percentage,
    ).toBe(100);
    expect(() => service.calculateFinal(exam, [])).toThrow(
      UnprocessableEntityException,
    );
  });
});
