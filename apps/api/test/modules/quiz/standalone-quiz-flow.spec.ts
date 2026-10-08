import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = { id: string; options: Array<{ id: string }> };

/**
 * The standalone journey the web routes drive, over the real API:
 * /quizzes -> /quizzes/:slug -> /quizzes/:slug/attempt
 * -> /quizzes/:slug/results/:attemptId -> /my-quiz-attempts.
 */
describe('Q21 standalone quiz flow and learner history', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let author: Account;
  // Unique per run: the test database is shared with other suites.
  const tag = `q21${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    t = await learningApp('quiz-q21');
    origin = t.app.get(AuthConfig).origin;
    author = await t.account('instructor');
  });
  afterAll(() => t?.app.close());

  const as = (account: Account) => {
    const call = (
      method: 'get' | 'post' | 'put',
      path: string,
      body?: object,
    ) => {
      const pending = t
        .http()
        [method](path)
        .set('Origin', origin)
        .set('Cookie', account.session);
      return body ? pending.send(body) : pending;
    };
    return call;
  };

  /** "js-assessment"-style quiz: Q1 10 pts, Q2 30 pts; option 0 right. */
  async function publishStandalone(
    settings: {
      maxAttempts?: number;
      difficulty?: string;
      tags?: string[];
    } = {},
  ) {
    const call = as(author);
    const slug = `${tag}-js-assessment-${randomUUID().slice(0, 6)}`;
    const created = await call('post', '/admin/quizzes', {
      title: `${tag} JS Assessment`,
      slug,
      description: 'Đánh giá JavaScript cơ bản',
      scope: 'STANDALONE',
      passingScore: 70,
      durationMinutes: 20,
      reviewPolicy: 'AFTER_SUBMIT',
      shuffleQuestions: false,
      shuffleOptions: false,
      difficulty: 'BEGINNER',
      tags: [tag, 'JavaScript '],
      ...settings,
    }).expect(201);
    expect(created.body).toMatchObject({
      difficulty: settings.difficulty ?? 'BEGINNER',
    });
    const questions: Question[] = [];
    for (const points of [10, 30])
      questions.push(
        (
          await call('post', `/admin/quizzes/${created.body.id}/questions`, {
            content: `Worth ${points}`,
            points,
            explanation: 'Because',
            options: [
              { content: 'Right', isCorrect: true },
              { content: 'Wrong' },
            ],
          }).expect(201)
        ).body as Question,
      );
    await call('post', `/admin/quizzes/${created.body.id}/publish`).expect(200);
    return { id: created.body.id as string, slug, questions };
  }

  describe('discovery to result', () => {
    it('runs list -> detail -> start -> autosave -> submit -> result for a learner with no courses', async () => {
      const learner = await t.account();
      const call = as(learner);
      // The learner is enrolled nowhere.
      const [{ enrollments }] = await t.db.query(
        'SELECT count(*)::int AS enrollments FROM enrollments WHERE user_id = $1',
        [learner.id],
      );
      expect(enrollments).toBe(0);
      const quiz = await publishStandalone();

      // /quizzes
      const list = await call(
        'get',
        `/quizzes/standalone?search=${tag}`,
      ).expect(200);
      expect(list.body.quizzes).toEqual([
        expect.objectContaining({
          id: quiz.id,
          slug: quiz.slug,
          title: `${tag} JS Assessment`,
          description: 'Đánh giá JavaScript cơ bản',
          durationMinutes: 20,
          totalQuestions: 2,
          passingScore: 70,
          totalAttempts: 0,
          difficulty: 'BEGINNER',
          tags: [tag, 'javascript'],
        }),
      ]);

      // /quizzes/:slug
      const detail = await call(
        'get',
        `/quizzes/standalone/${quiz.slug}`,
      ).expect(200);
      expect(detail.body).toMatchObject({
        id: quiz.id,
        durationMinutes: 20,
        passingScore: 70,
        maxAttempts: null,
        reviewPolicy: 'AFTER_SUBMIT',
        attemptsUsed: 0,
        hasActiveAttempt: false,
        highestPercentage: null,
        latestResult: null,
      });

      // [Bắt đầu Làm bài] -> /quizzes/:slug/attempt
      const started = await call('post', `/quizzes/${quiz.id}/attempts`).expect(
        201,
      );
      const attemptId = started.body.id as string;
      expect(started.body.quiz.questions).toHaveLength(2);
      await call('put', `/quiz-attempts/${attemptId}/answers`, {
        questionId: quiz.questions[0]!.id,
        selectedOptionId: quiz.questions[0]!.options[0]!.id,
      }).expect(200);
      await call('put', `/quiz-attempts/${attemptId}/answers`, {
        questionId: quiz.questions[1]!.id,
        selectedOptionId: quiz.questions[1]!.options[0]!.id,
      }).expect(200);
      // The runner reloads: everything was autosaved.
      const resumed = await call(
        'get',
        `/quizzes/${quiz.id}/active-attempt`,
      ).expect(200);
      expect(resumed.body.answers).toHaveLength(2);
      const detailRunning = await call(
        'get',
        `/quizzes/standalone/${quiz.slug}`,
      ).expect(200);
      expect(detailRunning.body.hasActiveAttempt).toBe(true);

      // [Nộp bài] -> /quizzes/:slug/results/:attemptId
      const submitted = await call(
        'post',
        `/quiz-attempts/${attemptId}/submit`,
      ).expect(200);
      expect(submitted.body).toMatchObject({
        id: attemptId,
        status: 'COMPLETED',
      });
      const result = await call(
        'get',
        `/quiz-attempts/${attemptId}/result`,
      ).expect(200);
      expect(result.body).toMatchObject({
        attemptId,
        quizId: quiz.id,
        score: {
          earnedPoints: 40,
          totalPoints: 40,
          percentage: 100,
          passed: true,
        },
        reviewAllowed: true,
      });

      // The landing page now shows the learner's standing.
      const after = await call(
        'get',
        `/quizzes/standalone/${quiz.slug}`,
      ).expect(200);
      expect(after.body).toMatchObject({
        attemptsUsed: 1,
        hasActiveAttempt: false,
        isPassed: true,
        highestPercentage: 100,
        latestResult: {
          attemptId,
          status: 'COMPLETED',
          passed: true,
          percentage: 100,
        },
      });
      expect(
        (await call('get', `/quizzes/standalone?search=${tag}`).expect(200))
          .body.quizzes[0].totalAttempts,
      ).toBe(1);
    });

    it('filters the hub by difficulty and tag', async () => {
      const call = as(await t.account());
      const beginner = await publishStandalone({ tags: [`${tag}-easy`] });
      const advanced = await publishStandalone({
        difficulty: 'ADVANCED',
        tags: [`${tag}-hard`],
      });
      const ids = async (query: string) =>
        (
          await call('get', `/quizzes/standalone?${query}`).expect(200)
        ).body.quizzes.map(({ id }: { id: string }) => id);
      expect(await ids(`tag=${tag}-easy`)).toEqual([beginner.id]);
      expect(await ids(`tag=${tag}-HARD`)).toEqual([advanced.id]);
      expect(await ids(`search=${tag}&difficulty=ADVANCED`)).toEqual([
        advanced.id,
      ]);
      await call('get', '/quizzes/standalone?difficulty=EXPERT').expect(400);
    });

    it('validates discovery metadata when authoring', async () => {
      const call = as(author);
      await call('post', '/admin/quizzes', {
        title: 'Too many tags',
        scope: 'STANDALONE',
        tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
      }).expect(400);
      await call('post', '/admin/quizzes', {
        title: 'Bad tag',
        scope: 'STANDALONE',
        tags: ['<script>'],
      }).expect(400);
    });
  });

  describe('history', () => {
    it('puts the new attempt first in /my-quiz-attempts with its metadata', async () => {
      const learner = await t.account();
      const call = as(learner);
      const owner = await t.account('instructor');
      const course = await t.course(owner, 1, [learner]);
      // An older course-bound attempt.
      const courseQuiz = await as(owner)('post', '/admin/quizzes', {
        title: `${tag} Course quiz`,
        scope: 'COURSE',
        targetId: course.id,
      }).expect(201);
      await as(owner)(
        'post',
        `/admin/quizzes/${courseQuiz.body.id}/questions`,
        {
          content: 'Q',
          options: [{ content: 'A', isCorrect: true }, { content: 'B' }],
        },
      ).expect(201);
      await as(owner)(
        'post',
        `/admin/quizzes/${courseQuiz.body.id}/publish`,
      ).expect(200);
      const courseAttempt = (
        await call('post', `/quizzes/${courseQuiz.body.id}/attempts`).expect(
          201,
        )
      ).body.id as string;
      await call('post', `/quiz-attempts/${courseAttempt}/submit`).expect(200);

      // Then a standalone one, half right.
      const quiz = await publishStandalone();
      const attemptId = (
        await call('post', `/quizzes/${quiz.id}/attempts`).expect(201)
      ).body.id as string;
      await call('put', `/quiz-attempts/${attemptId}/answers`, {
        questionId: quiz.questions[0]!.id,
        selectedOptionId: quiz.questions[0]!.options[0]!.id,
      }).expect(200);
      await call('post', `/quiz-attempts/${attemptId}/submit`).expect(200);
      // And one still running.
      const running = await publishStandalone();
      const runningId = (
        await call('post', `/quizzes/${running.id}/attempts`).expect(201)
      ).body.id as string;

      const all = await call('get', '/my-quiz-attempts').expect(200);
      expect(all.headers['cache-control']).toBe('private, no-store');
      expect(all.body.pagination).toMatchObject({ totalItems: 3 });
      expect(
        all.body.attempts.map(({ attemptId: id }: { attemptId: string }) => id),
      ).toEqual([runningId, attemptId, courseAttempt]);
      expect(all.body.attempts[1]).toEqual({
        attemptId,
        quizId: quiz.id,
        quizTitle: `${tag} JS Assessment`,
        quizSlug: quiz.slug,
        scope: 'STANDALONE',
        courseId: null,
        courseSlug: null,
        courseTitle: null,
        attemptNumber: 1,
        status: 'COMPLETED',
        isExpired: false,
        startedAt: expect.any(String),
        submittedAt: expect.any(String),
        expiresAt: expect.any(String),
        durationSeconds: expect.any(Number),
        earnedPoints: 10,
        totalPoints: 40,
        percentage: 25,
        isPassed: false,
      });
      expect(all.body.attempts[0]).toMatchObject({
        status: 'IN_PROGRESS',
        submittedAt: null,
        percentage: null,
      });
      expect(all.body.attempts[2]).toMatchObject({
        scope: 'COURSE',
        courseId: course.id,
        courseSlug: expect.any(String),
        quizSlug: null,
      });
      // No answers or keys in history rows.
      expect(JSON.stringify(all.body)).not.toMatch(
        /isCorrect|explanation|questions/,
      );

      const standalone = await call(
        'get',
        '/my-quiz-attempts?scope=standalone',
      ).expect(200);
      expect(
        standalone.body.attempts.map(({ scope }: { scope: string }) => scope),
      ).toEqual(['STANDALONE', 'STANDALONE']);
      const courseOnly = await call(
        'get',
        '/my-quiz-attempts?scope=course',
      ).expect(200);
      expect(
        courseOnly.body.attempts.map(
          ({ attemptId: id }: { attemptId: string }) => id,
        ),
      ).toEqual([courseAttempt]);
      await call('get', '/my-quiz-attempts?scope=other').expect(400);
      await t.http().get('/my-quiz-attempts').expect(401);

      // Someone else's history is their own.
      const stranger = await t.account();
      expect(
        (await as(stranger)('get', '/my-quiz-attempts').expect(200)).body
          .attempts,
      ).toEqual([]);
    });
  });

  describe('no course constraint', () => {
    it('never answers TARGET_COURSE_FORBIDDEN on the standalone path', async () => {
      const learner = await t.account();
      const call = as(learner);
      const quiz = await publishStandalone({ maxAttempts: 2 });
      const responses = [
        await call('get', `/quizzes/standalone/${quiz.slug}`),
        await call('post', `/quizzes/${quiz.id}/attempts`),
      ];
      const attemptId = responses[1]!.body.id as string;
      responses.push(
        await call('get', `/quizzes/${quiz.id}/active-attempt`),
        await call('put', `/quiz-attempts/${attemptId}/answers`, {
          questionId: quiz.questions[0]!.id,
          selectedOptionIds: [],
        }),
        await call('post', `/quiz-attempts/${attemptId}/submit`),
        await call('get', `/quiz-attempts/${attemptId}/result`),
        await call('post', `/quizzes/${quiz.id}/attempts`),
        await call('get', '/my-quiz-attempts'),
      );
      for (const response of responses) {
        expect(response.body.code).not.toBe('TARGET_COURSE_FORBIDDEN');
        expect([200, 201]).toContain(response.status);
      }
    });
  });
});
