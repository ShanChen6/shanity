import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = { id: string; options: Array<{ id: string }> };
type Policy = 'NEVER' | 'AFTER_SUBMIT' | 'AFTER_PASS' | 'AFTER_EXHAUSTED';

/** Every object key anywhere in a JSON payload. */
function allKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(allKeys);
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, nested]) => [
      key,
      ...allKeys(nested),
    ]);
  return [];
}

describe('Q18 result and review policy engine', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q18');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  /** Two 10-point single choice questions; option 0 right; pass at 50%. */
  async function quiz(
    reviewPolicy: Policy,
    settings: {
      scope?: string;
      maxAttempts?: number;
      durationMinutes?: number;
    } = {},
  ) {
    const { scope = 'LESSON', ...rest } = settings;
    const send = (path: string, body?: object) =>
      t.send('post', path, owner.session, body);
    const created = await send('/admin/quizzes', {
      title: `Q18 ${reviewPolicy}`,
      scope,
      targetId:
        scope === 'STANDALONE'
          ? null
          : scope === 'COURSE'
            ? course.id
            : course.lessons[0]!.id,
      ...(scope === 'STANDALONE' && { slug: `q18-${randomUUID()}` }),
      reviewPolicy,
      passingScore: 50,
      shuffleQuestions: false,
      shuffleOptions: false,
      ...rest,
    }).expect(201);
    const id = created.body.id as string;
    const questions: Question[] = [];
    for (const content of ['First', 'Second'])
      questions.push(
        (
          await send(`/admin/quizzes/${id}/questions`, {
            content,
            points: 10,
            explanation: `SECRET explanation of ${content}`,
            options: [
              { content: `${content} right`, isCorrect: true },
              { content: `${content} wrong` },
            ],
          }).expect(201)
        ).body as Question,
      );
    await send(`/admin/quizzes/${id}/publish`).expect(200);
    return { id, questions };
  }

  const call = (
    method: 'post' | 'put' | 'get',
    path: string,
    body?: object,
    session = student.session,
  ) => {
    const pending = t
      .http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', session);
    return body ? pending.send(body) : pending;
  };
  const result = (attemptId: string, session = student.session) =>
    call('get', `/quiz-attempts/${attemptId}/result`, undefined, session);

  /** Picks by option index (undefined leaves the question unanswered). */
  async function take(
    q: { id: string; questions: Question[] },
    picks: Array<number | undefined>,
  ) {
    const attemptId = (
      await call('post', `/quizzes/${q.id}/attempts`).expect(201)
    ).body.id as string;
    for (const [index, pick] of picks.entries())
      if (pick !== undefined)
        await call('put', `/quiz-attempts/${attemptId}/answers`, {
          questionId: q.questions[index]!.id,
          selectedOptionId: q.questions[index]!.options[pick]!.id,
        }).expect(200);
    await call('post', `/quiz-attempts/${attemptId}/submit`).expect(200);
    return attemptId;
  }

  const expectHidden = (body: Record<string, unknown>) => {
    expect(body.reviewAllowed).toBe(false);
    for (const question of body.questions as Array<Record<string, unknown>>) {
      expect(question).toMatchObject({
        isCorrect: null,
        pointsEarned: null,
        explanation: null,
      });
      for (const option of question.options as object[])
        expect(Object.keys(option).sort()).toEqual(['content', 'id']);
    }
    expect(allKeys(body.questions)).not.toContain('correctOptionId');
    expect(JSON.stringify(body)).not.toContain('SECRET');
  };
  const expectRevealed = (body: Record<string, unknown>) => {
    expect(body.reviewAllowed).toBe(true);
    for (const question of body.questions as Array<{
      explanation: string;
      isCorrect: boolean | null;
      options: Array<{ isCorrect?: boolean }>;
    }>) {
      expect(question.explanation).toMatch(/^SECRET explanation/);
      expect(typeof question.isCorrect).toBe('boolean');
      expect(question.options.map((option) => option.isCorrect)).toEqual([
        true,
        false,
      ]);
    }
  };

  describe('policy access security', () => {
    it('NEVER: score and selections only, no key or explanation', async () => {
      const q = await quiz('NEVER', { scope: 'STANDALONE' });
      const attemptId = await take(q, [0, 1]);
      const response = await result(attemptId).expect(200);

      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body).toMatchObject({
        attemptId,
        quizTitle: 'Q18 NEVER',
        status: 'COMPLETED',
        score: {
          earnedPoints: 10,
          totalPoints: 20,
          percentage: 50,
          passingScore: 50,
          passed: true,
        },
        attemptInfo: {
          currentAttempt: 1,
          maxAttempts: null,
          submittedAt: expect.any(String),
        },
        reviewPolicy: 'NEVER',
      });
      // Selections are the learner's own and stay visible.
      expect(
        response.body.questions.map(
          (question: { selectedOptionId: string }) => question.selectedOptionId,
        ),
      ).toEqual([
        q.questions[0]!.options[0]!.id,
        q.questions[1]!.options[1]!.id,
      ]);
      // Even a pass never unlocks NEVER.
      expectHidden(response.body);
    });

    it('AFTER_PASS: hidden after a fail, unlocked by the passing retake', async () => {
      const q = await quiz('AFTER_PASS');
      const failed = await take(q, [1, 1]);
      const first = await result(failed).expect(200);
      expect(first.body.score).toMatchObject({ percentage: 0, passed: false });
      expectHidden(first.body);

      const passed = await take(q, [0, 0]);
      const second = await result(passed).expect(200);
      expect(second.body.score).toMatchObject({
        percentage: 100,
        passed: true,
      });
      expect(second.body.attemptInfo.currentAttempt).toBe(2);
      expectRevealed(second.body);
      expect(
        second.body.questions.map(
          (question: { isCorrect: boolean; pointsEarned: number }) => [
            question.isCorrect,
            question.pointsEarned,
          ],
        ),
      ).toEqual([
        [true, 10],
        [true, 10],
      ]);

      // Disclosure follows each attempt's own result: the failed one stays shut.
      expectHidden((await result(failed).expect(200)).body);
    });

    it('AFTER_SUBMIT: everything right after submitting, unanswered marked wrong', async () => {
      const q = await quiz('AFTER_SUBMIT', { scope: 'COURSE' });
      const attemptId = await take(q, [1, undefined]);
      const { body } = await result(attemptId).expect(200);
      expectRevealed(body);
      expect(body.score).toMatchObject({ earnedPoints: 0, passed: false });
      expect(body.questions[1]).toMatchObject({
        selectedOptionId: null,
        selectedOptionIds: [],
        isCorrect: false,
        pointsEarned: 0,
      });
    });

    it('AFTER_EXHAUSTED: shut until the frozen limit is used up', async () => {
      const q = await quiz('AFTER_EXHAUSTED', { maxAttempts: 2 });
      const first = await take(q, [0, 0]);
      expectHidden((await result(first).expect(200)).body);
      const second = await take(q, [1, 1]);
      expectRevealed((await result(second).expect(200)).body);
      expectRevealed((await result(first).expect(200)).body);
    });
  });

  describe('result availability', () => {
    it('has no result while running, and none for other learners', async () => {
      const q = await quiz('AFTER_SUBMIT');
      const attemptId = (
        await call('post', `/quizzes/${q.id}/attempts`).expect(201)
      ).body.id as string;
      const running = await result(attemptId).expect(409);
      expect(running.body.code).toBe('ATTEMPT_NOT_SUBMITTED');

      await call('post', `/quiz-attempts/${attemptId}/submit`).expect(200);
      const other = await t.account();
      await t.db.query(
        'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
        [other.id, course.id],
      );
      expect(
        (await result(attemptId, other.session).expect(404)).body.code,
      ).toBe('ATTEMPT_NOT_FOUND');
      await result(randomUUID()).expect(404);
      await t.http().get(`/quiz-attempts/${attemptId}/result`).expect(401);
    });

    it('auto-submits an expired attempt when its result is asked for', async () => {
      const q = await quiz('AFTER_SUBMIT', { durationMinutes: 5 });
      const attemptId = (
        await call('post', `/quizzes/${q.id}/attempts`).expect(201)
      ).body.id as string;
      await call('put', `/quiz-attempts/${attemptId}/answers`, {
        questionId: q.questions[0]!.id,
        selectedOptionId: q.questions[0]!.options[0]!.id,
      }).expect(200);
      await t.db.query(
        `UPDATE quiz_attempts SET expires_at = started_at + interval '1 millisecond'
         WHERE id = $1`,
        [attemptId],
      );
      const { body } = await result(attemptId).expect(200);
      expect(body).toMatchObject({
        status: 'TIMED_OUT',
        notice: 'ATTEMPT_TIMED_OUT',
        score: { earnedPoints: 10, percentage: 50, passed: true },
      });
    });
  });
});
