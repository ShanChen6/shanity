import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EntityManager } from 'typeorm';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import type { QuizEntity } from '../../../src/modules/quiz/entities/quiz.entity.js';
import { QuizPublishValidationPipeline } from '../../../src/modules/quiz/services/quiz-publish-validation.pipeline.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = { id: string; options: Array<{ id: string }> };

describe('Q10 publish quality gate', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let otherInstructor: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q10');
    // Listen once so parallel requests share one port.
    await t.app.listen(0);
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    otherInstructor = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  const call = (
    method: 'post' | 'put' | 'patch' | 'delete',
    path: string,
    session = owner.session,
    body?: object,
  ) => {
    const pending = t
      .http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', session);
    return body ? pending.send(body) : pending;
  };
  const publish = (quizId: string, session = owner.session) =>
    call('post', `/admin/quizzes/${quizId}/publish`, session);

  async function draft(settings: object = {}) {
    const response = await call('post', '/admin/quizzes', owner.session, {
      title: `Q10 ${randomUUID().slice(0, 8)}`,
      scope: 'LESSON',
      targetId: course.lessons[0]!.id,
      ...settings,
    }).expect(201);
    return response.body.id as string;
  }
  async function question(quizId: string, body: object = {}) {
    const response = await call(
      'post',
      `/admin/quizzes/${quizId}/questions`,
      owner.session,
      {
        content: 'Question',
        options: [{ content: 'Right', isCorrect: true }, { content: 'Wrong' }],
        ...body,
      },
    ).expect(201);
    return response.body as Question;
  }
  const status = async (quizId: string) =>
    (
      await t.db.query(
        'SELECT status, published_at AS "publishedAt" FROM quizzes WHERE id = $1',
        [quizId],
      )
    )[0] as { status: string; publishedAt: Date | null };
  const rejected = async (quizId: string) => {
    const response = await publish(quizId).expect(422);
    expect(response.body).toMatchObject({
      statusCode: 422,
      code: 'QUIZ_NOT_PUBLISHABLE',
    });
    expect(await status(quizId)).toEqual({
      status: 'DRAFT',
      publishedAt: null,
    });
    return response.body.issues as Array<{ code: string; questionId?: string }>;
  };

  describe('quality gate violations', () => {
    it('rejects a quiz without questions', async () => {
      expect(await rejected(await draft())).toEqual([
        { code: 'QUIZ_HAS_NO_QUESTIONS' },
      ]);
    });

    it('rejects a question without a correct option', async () => {
      const quizId = await draft();
      await question(quizId);
      const broken = await question(quizId, {
        options: [{ content: 'A' }, { content: 'B' }],
      });
      expect(await rejected(quizId)).toEqual([
        { code: 'QUESTION_MISSING_CORRECT_OPTION', questionId: broken.id },
      ]);
    });

    it('rejects zero points (unreachable through the API and the schema)', async () => {
      const quizId = await draft();
      const valid = await question(quizId);
      await call(
        'put',
        `/admin/quizzes/${quizId}/questions/${valid.id}`,
        owner.session,
        { points: 0 },
      ).expect(400);
      await expect(
        t.db.query('UPDATE quiz_questions SET points = 0 WHERE id = $1', [
          valid.id,
        ]),
      ).rejects.toMatchObject({ code: '23514' });

      // The gate itself still reports it, should a row ever carry it.
      const pipeline = t.app.get(QuizPublishValidationPipeline);
      const [quiz] = await t.db.query(
        `SELECT id, scope, target_id AS "targetId", passing_score AS "passingScore",
           max_attempts AS "maxAttempts", duration_minutes AS "durationMinutes",
           review_policy AS "reviewPolicy"
         FROM quizzes WHERE id = $1`,
        [quizId],
      );
      const manager = {
        query: (sql: string, parameters?: unknown[]) =>
          t.db.query(sql, parameters),
        getRepository: () => ({
          find: () =>
            Promise.resolve([
              {
                id: valid.id,
                type: 'SINGLE_CHOICE',
                points: 0,
                options: [{ isCorrect: true }, { isCorrect: false }],
              },
            ]),
        }),
      } as unknown as EntityManager;
      await expect(
        pipeline.validate(quiz as QuizEntity, manager),
      ).resolves.toEqual([
        { code: 'INVALID_QUESTION_POINTS', questionId: valid.id },
      ]);
    });

    it('reports every violation at once, in checklist order', async () => {
      const quizId = await draft({
        passingScore: 0,
        reviewPolicy: 'AFTER_EXHAUSTED',
      });
      const lonely = await question(quizId, {
        options: [{ content: 'Only', isCorrect: true }],
      });
      const allRight = await question(quizId, {
        type: 'MULTIPLE_CHOICE',
        options: [
          { content: 'A', isCorrect: true },
          { content: 'B', isCorrect: true },
        ],
      });
      const doubleKey = await question(quizId);
      // Not reachable through the API (radio semantics), only by direct SQL.
      await t.db.query(
        'UPDATE quiz_options SET is_correct = true WHERE question_id = $1',
        [doubleKey.id],
      );

      expect(await rejected(quizId)).toEqual([
        { code: 'QUESTION_NEEDS_TWO_OPTIONS', questionId: lonely.id },
        {
          code: 'MULTIPLE_CHOICE_NEEDS_INCORRECT_OPTION',
          questionId: allRight.id,
        },
        {
          code: 'SINGLE_CHOICE_HAS_MULTIPLE_CORRECT',
          questionId: doubleKey.id,
        },
        { code: 'INVALID_PASSING_SCORE' },
        { code: 'REVIEW_POLICY_REQUIRES_MAX_ATTEMPTS' },
      ]);
    });
  });

  describe('publishing', () => {
    it('publishes a valid draft and freezes it for in-place edits', async () => {
      const quizId = await draft({ maxAttempts: 3, durationMinutes: 20 });
      const valid = await question(quizId, {
        type: 'MULTIPLE_CHOICE',
        options: [
          { content: 'A', isCorrect: true },
          { content: 'B', isCorrect: true },
          { content: 'C' },
        ],
      });

      const response = await publish(quizId).expect(200);
      expect(Object.keys(response.body).sort()).toEqual(
        ['id', 'publishedAt', 'status', 'title', 'version'].sort(),
      );
      expect(response.body).toMatchObject({
        id: quizId,
        version: 1,
        status: 'PUBLISHED',
        publishedAt: expect.any(String),
      });
      expect((await status(quizId)).publishedAt).toBeInstanceOf(Date);

      await call('put', `/admin/quizzes/${quizId}`, owner.session, {
        title: 'Too late',
      }).expect(409);
      await call(
        'post',
        `/admin/questions/${valid.id}/options`,
        owner.session,
        {
          content: 'D',
        },
      ).expect(409);
      // Learners can take it now.
      await t
        .http()
        .post(`/quizzes/${quizId}/attempts`)
        .set('Origin', origin)
        .set('Cookie', student.session)
        .expect(201);
    });

    it('refuses archived quizzes and enforces quiz authority', async () => {
      const quizId = await draft();
      await question(quizId);
      expect(
        (await publish(quizId, otherInstructor.session).expect(403)).body.code,
      ).toBe('QUIZ_FORBIDDEN');
      expect(
        (await publish(quizId, student.session).expect(403)).body.code,
      ).toBe('FORBIDDEN_RESOURCE');
      expect((await publish(randomUUID()).expect(403)).body.code).toBe(
        'QUIZ_FORBIDDEN',
      );
      await t
        .http()
        .post(`/admin/quizzes/${quizId}/publish`)
        .set('Cookie', owner.session)
        .expect(403); // no Origin header

      await t.db.query(`UPDATE quizzes SET status = 'ARCHIVED' WHERE id = $1`, [
        quizId,
      ]);
      expect((await publish(quizId).expect(409)).body.code).toBe(
        'QUIZ_NOT_DRAFT',
      );
    });
  });

  describe('anti-bypass and concurrency', () => {
    it('cannot reach PUBLISHED through the CRUD routes', async () => {
      const quizId = await draft();
      await question(quizId);
      for (const body of [
        { status: 'PUBLISHED' },
        { title: 'Sneaky', status: 'PUBLISHED' },
        { publishedAt: new Date().toISOString() },
      ])
        await call(
          'put',
          `/admin/quizzes/${quizId}`,
          owner.session,
          body,
        ).expect(400);
      await call('patch', `/admin/quizzes/${quizId}`, owner.session, {
        status: 'PUBLISHED',
      }).expect(404);
      await call('post', '/admin/quizzes', owner.session, {
        title: 'Born published',
        scope: 'STANDALONE',
        status: 'PUBLISHED',
      }).expect(400);
      expect(await status(quizId)).toEqual({
        status: 'DRAFT',
        publishedAt: null,
      });
    });

    it('queues concurrent publishes: one succeeds, the rest get 409', async () => {
      const quizId = await draft();
      await question(quizId);
      const responses = await Promise.all(
        Array.from({ length: 4 }, () => publish(quizId)),
      );
      expect(responses.map(({ status: code }) => code).sort()).toEqual([
        200, 409, 409, 409,
      ]);
      for (const response of responses.filter(
        ({ status: code }) => code === 409,
      ))
        expect(response.body.code).toBe('QUIZ_ALREADY_PUBLISHED');
      expect((await status(quizId)).status).toBe('PUBLISHED');
    });

    it('never publishes a state an in-flight edit is invalidating', async () => {
      for (let round = 0; round < 5; round++) {
        const quizId = await draft();
        const only = await question(quizId);
        const [published, deleted] = await Promise.all([
          publish(quizId),
          call(
            'delete',
            `/admin/quizzes/${quizId}/questions/${only.id}`,
            owner.session,
          ),
        ]);
        // Serialized on the quiz row: either publish saw the question (and the
        // delete was then refused), or the delete ran first (and the empty
        // quiz was refused).
        expect([
          [200, 409],
          [422, 200],
        ]).toContainEqual([published.status, deleted.status]);
        const [{ count }] = await t.db.query(
          'SELECT count(*)::int AS count FROM quiz_questions WHERE quiz_id = $1',
          [quizId],
        );
        expect(count).toBe(
          (await status(quizId)).status === 'PUBLISHED' ? 1 : 0,
        );
      }
    });
  });
});
