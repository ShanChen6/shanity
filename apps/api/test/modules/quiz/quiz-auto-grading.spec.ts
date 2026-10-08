import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { gradeAttempt } from '../../../src/modules/quiz/services/quiz-grading.js';
import type { QuizAttemptSnapshot } from '../../../src/modules/quiz/services/quiz-attempt-snapshot.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = { id: string; options: Array<{ id: string }> };
type QuestionSpec = { points: number; multiple?: boolean };

describe('Q17 auto-grading engine', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q17');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  /**
   * Single choice: option 0 right, option 1 wrong. Multiple choice: options
   * 0 and 1 right, option 2 wrong.
   */
  async function quiz(specs: QuestionSpec[], passingScore = 80) {
    const send = (path: string, body?: object) =>
      t.send('post', path, owner.session, body);
    const created = await send('/admin/quizzes', {
      title: 'Q17',
      scope: 'LESSON',
      targetId: course.lessons[0]!.id,
      passingScore,
      shuffleQuestions: false,
      shuffleOptions: false,
    }).expect(201);
    const id = created.body.id as string;
    const questions: Question[] = [];
    for (const [index, spec] of specs.entries())
      questions.push(
        (
          await send(`/admin/quizzes/${id}/questions`, {
            content: `Q${index + 1}`,
            points: spec.points,
            ...(spec.multiple
              ? {
                  type: 'MULTIPLE_CHOICE',
                  options: [
                    { content: 'R1', isCorrect: true },
                    { content: 'R2', isCorrect: true },
                    { content: 'W' },
                  ],
                }
              : {
                  options: [
                    { content: 'R', isCorrect: true },
                    { content: 'W' },
                  ],
                }),
          }).expect(201)
        ).body as Question,
      );
    await send(`/admin/quizzes/${id}/publish`).expect(200);
    return { id, questions };
  }

  const call = (method: 'post' | 'put', path: string, body?: object) => {
    const pending = t
      .http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', student.session);
    return body ? pending.send(body) : pending;
  };

  /** Starts, saves the given selections (by option index), submits. */
  async function take(
    quizId: string,
    questions: Question[],
    picks: Array<number[] | undefined>,
    submitBody?: object,
  ) {
    const attemptId = (
      await call('post', `/quizzes/${quizId}/attempts`).expect(201)
    ).body.id as string;
    for (const [index, pick] of picks.entries())
      if (pick)
        await call('put', `/quiz-attempts/${attemptId}/answers`, {
          questionId: questions[index]!.id,
          selectedOptionIds: pick.map((i) => questions[index]!.options[i]!.id),
        }).expect(200);
    const result = await call(
      'post',
      `/quiz-attempts/${attemptId}/submit`,
      submitBody,
    ).expect(200);
    const [row] = await t.db.query(
      `SELECT earned_points AS "earnedPoints", total_points AS "totalPoints",
         percentage, score, is_passed AS "isPassed", status,
         submitted_at IS NOT NULL AS "hasSubmittedAt"
       FROM quiz_attempts WHERE id = $1`,
      [attemptId],
    );
    const answers = await t.db.query(
      `SELECT question_id AS "questionId", is_correct AS "isCorrect",
         points_earned AS "pointsEarned"
       FROM attempt_answers WHERE attempt_id = $1`,
      [attemptId],
    );
    return { attemptId, body: result.body, row, answers };
  }

  describe('grading verification', () => {
    it('scores 100% and passes when every answer is right', async () => {
      const { id, questions } = await quiz([
        { points: 10 },
        { points: 20, multiple: true },
      ]);
      const { body, row } = await take(id, questions, [[0], [0, 1]]);
      expect(body).toMatchObject({
        status: 'COMPLETED',
        earnedPoints: 30,
        totalPoints: 30,
        percentage: 100,
        score: 100,
        isPassed: true,
      });
      // Persisted as numeric(5,2).
      expect(row).toEqual({
        earnedPoints: 30,
        totalPoints: 30,
        percentage: '100.00',
        score: 100,
        isPassed: true,
        status: 'COMPLETED',
        hasSubmittedAt: true,
      });
    });

    it('weights partial credit by each question’s points', async () => {
      const { id, questions } = await quiz(
        [{ points: 10 }, { points: 20 }],
        67,
      );
      // Only the 20-point question right: 20/30 = 66.666... -> 66.67.
      const heavy = await take(id, questions, [[1], [0]]);
      expect(heavy.body).toMatchObject({
        earnedPoints: 20,
        totalPoints: 30,
        percentage: 66.67,
        score: 66,
        // 66.67 < 67: no whole-number rounding can lift it over the mark.
        isPassed: false,
      });
      expect(heavy.row.percentage).toBe('66.67');
      expect(heavy.answers).toEqual(
        expect.arrayContaining([
          { questionId: questions[0]!.id, isCorrect: false, pointsEarned: 0 },
          { questionId: questions[1]!.id, isCorrect: true, pointsEarned: 20 },
        ]),
      );

      // Only the 10-point one: 33.33.
      const light = await take(id, questions, [[0], [1]]);
      expect(light.body).toMatchObject({
        earnedPoints: 10,
        percentage: 33.33,
        isPassed: false,
      });
    });

    it('rounds half up at the second decimal and passes exactly at the mark', async () => {
      // 1 of 32 points = 3.125% -> 3.13.
      const tiny = await quiz([{ points: 1 }, { points: 31 }], 3);
      const low = await take(tiny.id, tiny.questions, [[0], [1]]);
      expect(low.body).toMatchObject({
        percentage: 3.13,
        score: 3,
        isPassed: true,
      });
      expect(low.row.percentage).toBe('3.13');

      // 3 of 4 points = 75.00% against passingScore 75.
      const exact = await quiz(
        [{ points: 1 }, { points: 1 }, { points: 1 }, { points: 1 }],
        75,
      );
      const boundary = await take(exact.id, exact.questions, [
        [0],
        [0],
        [0],
        [1],
      ]);
      expect(boundary.body).toMatchObject({
        percentage: 75,
        score: 75,
        isPassed: true,
      });
    });

    it('gives zero for unanswered, cleared and partially chosen questions without failing', async () => {
      const { id, questions } = await quiz([
        { points: 10 },
        { points: 20, multiple: true },
        { points: 30 },
      ]);
      // Q1 cleared, Q2 only one of its two right options, Q3 never touched.
      const graded = await take(id, questions, [[], [0], undefined]);
      expect(graded.body).toMatchObject({
        status: 'COMPLETED',
        earnedPoints: 0,
        totalPoints: 60,
        percentage: 0,
        score: 0,
        isPassed: false,
      });
      expect(graded.answers).toHaveLength(2);
      for (const answer of graded.answers)
        expect(answer).toMatchObject({ isCorrect: false, pointsEarned: 0 });

      // Nothing answered at all.
      const empty = await take(id, questions, [
        undefined,
        undefined,
        undefined,
      ]);
      expect(empty.body).toMatchObject({ earnedPoints: 0, percentage: 0 });
      expect(empty.answers).toEqual([]);
    });

    it('ignores any score the client sends', async () => {
      const { id, questions } = await quiz([{ points: 10 }, { points: 10 }]);
      const { body } = await take(id, questions, [[1], [1]], {
        score: 100,
        percentage: 100,
        earnedPoints: 20,
        isPassed: true,
      });
      expect(body).toMatchObject({
        earnedPoints: 0,
        percentage: 0,
        isPassed: false,
      });
    });
  });

  describe('engine purity', () => {
    const snapshot = (passingScore: number): QuizAttemptSnapshot =>
      ({
        quiz: { passingScore },
        questions: [
          {
            id: 'q1',
            points: 1,
            options: [
              { id: 'a', isCorrect: true },
              { id: 'b', isCorrect: false },
            ],
          },
          {
            id: 'q2',
            points: 2,
            options: [
              { id: 'c', isCorrect: true },
              { id: 'd', isCorrect: false },
            ],
          },
        ],
      }) as unknown as QuizAttemptSnapshot;

    it('computes only from the snapshot and the saved answers', () => {
      expect(
        gradeAttempt(snapshot(67), [
          { questionId: 'q2', selectedOptionIds: ['c'] },
          // An answer to a question outside the snapshot is ignored.
          { questionId: 'ghost', selectedOptionIds: ['a'] },
        ]),
      ).toEqual({
        answers: [
          { questionId: 'q1', isCorrect: false, pointsEarned: 0 },
          { questionId: 'q2', isCorrect: true, pointsEarned: 2 },
        ],
        earnedPoints: 2,
        totalPoints: 3,
        percentage: 66.67,
        score: 66,
        isPassed: false,
      });
    });
  });
});
