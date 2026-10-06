import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Ids = { quizId: string; questionId: string; optionIds: string[] };
type Route = {
  name: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: (ids: Ids) => string;
  body?: (ids: Ids) => object;
};

// Every quiz-scoped authoring route, from Q4, Q6 and Q7.
const QUIZ_ROUTES: Route[] = [
  { name: 'detail', method: 'get', path: (i) => `/admin/quizzes/${i.quizId}` },
  {
    name: 'update quiz',
    method: 'put',
    path: (i) => `/admin/quizzes/${i.quizId}`,
    body: () => ({ title: 'Hijacked title' }),
  },
  {
    name: 'delete quiz',
    method: 'delete',
    path: (i) => `/admin/quizzes/${i.quizId}`,
  },
  {
    name: 'list questions',
    method: 'get',
    path: (i) => `/admin/quizzes/${i.quizId}/questions`,
  },
  {
    name: 'create question',
    method: 'post',
    path: (i) => `/admin/quizzes/${i.quizId}/questions`,
    body: () => ({ content: 'Injected' }),
  },
  {
    name: 'update question',
    method: 'put',
    path: (i) => `/admin/quizzes/${i.quizId}/questions/${i.questionId}`,
    body: () => ({ content: 'Injected' }),
  },
  {
    name: 'delete question',
    method: 'delete',
    path: (i) => `/admin/quizzes/${i.quizId}/questions/${i.questionId}`,
  },
  {
    name: 'reorder questions',
    method: 'patch',
    path: (i) => `/admin/quizzes/${i.quizId}/questions/reorder`,
    body: (i) => ({ items: [{ id: i.questionId, position: 1 }] }),
  },
  {
    name: 'create option',
    method: 'post',
    path: (i) => `/admin/questions/${i.questionId}/options`,
    body: () => ({ content: 'Injected' }),
  },
  {
    name: 'reorder options',
    method: 'patch',
    path: (i) => `/admin/questions/${i.questionId}/options/reorder`,
    body: (i) => ({
      items: i.optionIds.map((id, index) => ({ id, position: index + 1 })),
    }),
  },
  {
    name: 'update option',
    method: 'put',
    path: (i) => `/admin/options/${i.optionIds[0]}`,
    body: () => ({ isCorrect: false }),
  },
  {
    name: 'delete option',
    method: 'delete',
    path: (i) => `/admin/options/${i.optionIds[0]}`,
  },
];

describe('Q8 quiz ownership and authorization', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let instructorA: Account;
  let instructorB: Account;
  let assigned: Account;
  let student: Account;
  let admin: Account;
  let course: Awaited<ReturnType<typeof t.course>>;
  const quizzes: Record<'LESSON' | 'CHAPTER' | 'COURSE' | 'STANDALONE', Ids> =
    {} as never;

  beforeAll(async () => {
    t = await learningApp('quiz-q8');
    // Listen once so request lists built ahead of time share one port.
    await t.app.listen(0);
    origin = t.app.get(AuthConfig).origin;
    instructorA = await t.account('instructor');
    instructorB = await t.account('instructor');
    assigned = await t.account('instructor');
    student = await t.account();
    admin = await t.account();
    await t.db.query(
      `INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'admin')`,
      [admin.id],
    );
    course = await t.course(instructorA, 1, [student]);
    await t.db.query(
      'INSERT INTO course_instructors(course_id, user_id) VALUES ($1, $2)',
      [course.id, assigned.id],
    );
    for (const [scope, targetId] of [
      ['LESSON', course.lessons[0]!.id],
      ['CHAPTER', course.chapterId],
      ['COURSE', course.id],
      ['STANDALONE', null],
    ] as const)
      quizzes[scope] = await quizWithQuestion(instructorA, scope, targetId);
  });
  afterAll(() => t?.app.close());

  const send = (route: Route, ids: Ids, session?: string) => {
    let pending = t.http()[route.method](route.path(ids)).set('Origin', origin);
    if (session) pending = pending.set('Cookie', session);
    return route.body ? pending.send(route.body(ids)) : pending;
  };

  async function quizWithQuestion(
    author: Account,
    scope: string,
    targetId: string | null,
  ): Promise<Ids> {
    const quiz = await send(
      {
        name: 'create',
        method: 'post',
        path: () => '/admin/quizzes',
        body: () => ({ title: `Q8 ${scope}`, scope, targetId }),
      },
      {} as Ids,
      author.session,
    ).expect(201);
    const question = await send(
      QUIZ_ROUTES.find(({ name }) => name === 'create question')!,
      { quizId: quiz.body.id } as Ids,
      author.session,
    )
      .send({
        content: 'Original',
        options: [{ content: 'A', isCorrect: true }, { content: 'B' }],
      })
      .expect(201);
    return {
      quizId: quiz.body.id,
      questionId: question.body.id,
      optionIds: question.body.options.map(({ id }: { id: string }) => id),
    };
  }

  /** Runs every route and returns `name -> status code + error code`. */
  async function sweep(ids: Ids, session?: string) {
    const results: Record<string, string> = {};
    for (const route of QUIZ_ROUTES) {
      const response = await send(route, ids, session);
      results[route.name] =
        `${response.status} ${response.body.code ?? ''}`.trim();
    }
    return results;
  }
  const every = (outcome: string) =>
    Object.fromEntries(QUIZ_ROUTES.map(({ name }) => [name, outcome]));

  async function unchanged(ids: Ids, title: string) {
    const [quiz] = await t.db.query(
      'SELECT title, status FROM quizzes WHERE id = $1',
      [ids.quizId],
    );
    expect(quiz).toEqual({ title, status: 'DRAFT' });
    const rows = await t.db.query(
      `SELECT question.content, option.content AS option, option.is_correct AS correct
       FROM quiz_questions question
       JOIN quiz_options option ON option.question_id = question.id
       WHERE question.quiz_id = $1 ORDER BY option.position`,
      [ids.quizId],
    );
    expect(rows).toEqual([
      { content: 'Original', option: 'A', correct: true },
      { content: 'Original', option: 'B', correct: false },
    ]);
  }

  describe('cross-instructor isolation', () => {
    it('answers QUIZ_FORBIDDEN on every course-bound route', async () => {
      for (const scope of ['LESSON', 'CHAPTER', 'COURSE'] as const) {
        expect(await sweep(quizzes[scope], instructorB.session)).toEqual(
          every('403 QUIZ_FORBIDDEN'),
        );
        await unchanged(quizzes[scope], `Q8 ${scope}`);
      }
    });

    it("answers QUIZ_FORBIDDEN on another author's standalone quiz", async () => {
      expect(await sweep(quizzes.STANDALONE, instructorB.session)).toEqual(
        every('403 QUIZ_FORBIDDEN'),
      );
      // Course authority does not extend to standalone quizzes.
      expect(await sweep(quizzes.STANDALONE, assigned.session)).toEqual(
        every('403 QUIZ_FORBIDDEN'),
      );
      await unchanged(quizzes.STANDALONE, 'Q8 STANDALONE');
    });

    it('lets owners, assigned instructors and admins through', async () => {
      const read = QUIZ_ROUTES.filter(({ method }) => method === 'get');
      for (const [session, scopes] of [
        [instructorA.session, ['LESSON', 'CHAPTER', 'COURSE', 'STANDALONE']],
        [assigned.session, ['LESSON', 'CHAPTER', 'COURSE']],
        [admin.session, ['LESSON', 'CHAPTER', 'COURSE', 'STANDALONE']],
      ] as const)
        for (const scope of scopes)
          for (const route of read)
            await send(route, quizzes[scope], session).expect(200);

      // An assigned instructor may also write.
      const update = QUIZ_ROUTES.find(
        ({ name }) => name === 'update question',
      )!;
      await send(update, quizzes.CHAPTER, assigned.session)
        .send({ points: 15 })
        .expect(200);
    });
  });

  describe('information disclosure masking', () => {
    it('answers 403 QUIZ_FORBIDDEN for unknown ids, admins included', async () => {
      const unknown: Ids = {
        quizId: randomUUID(),
        questionId: randomUUID(),
        optionIds: [randomUUID()],
      };
      for (const session of [
        instructorA.session,
        instructorB.session,
        admin.session,
      ])
        expect(await sweep(unknown, session)).toEqual(
          every('403 QUIZ_FORBIDDEN'),
        );

      const malformed: Ids = {
        quizId: 'not-a-uuid',
        questionId: 'not-a-uuid',
        optionIds: ['not-a-uuid'],
      };
      expect(await sweep(malformed, instructorA.session)).toEqual(
        every('403 QUIZ_FORBIDDEN'),
      );
    });

    it('answers an unknown id exactly like a foreign standalone quiz', async () => {
      const unknown: Ids = {
        quizId: randomUUID(),
        questionId: randomUUID(),
        optionIds: [randomUUID()],
      };
      const route = QUIZ_ROUTES[0]!;
      const [missing, foreign] = [
        await send(route, unknown, instructorB.session),
        await send(route, quizzes.STANDALONE, instructorB.session),
      ];
      expect(missing.status).toBe(foreign.status);
      expect(missing.body).toEqual(foreign.body);
    });

    it('leaves a quiz whose target was deleted to admins only', async () => {
      const doomed = await t.addLesson(instructorA, course.chapterId, 'Doomed');
      const ids = await quizWithQuestion(instructorA, 'LESSON', doomed.id);
      await t.db.query(`UPDATE quizzes SET status = 'ARCHIVED' WHERE id = $1`, [
        ids.quizId,
      ]);
      await t.db.query('DELETE FROM lessons WHERE id = $1', [doomed.id]);

      const detail = QUIZ_ROUTES[0]!;
      expect(
        (await send(detail, ids, instructorA.session).expect(403)).body.code,
      ).toBe('QUIZ_FORBIDDEN');
      await send(detail, ids, admin.session).expect(200);
    });
  });

  describe('student block', () => {
    it('answers FORBIDDEN_RESOURCE to students on every authoring route', async () => {
      for (const scope of [
        'LESSON',
        'CHAPTER',
        'COURSE',
        'STANDALONE',
      ] as const)
        expect(await sweep(quizzes[scope], student.session)).toEqual(
          every('403 FORBIDDEN_RESOURCE'),
        );

      for (const [method, path] of [
        ['get', '/admin/quizzes'],
        ['post', '/admin/quizzes'],
      ] as const) {
        const response = await t
          .http()
          [method](path)
          .set('Origin', origin)
          .set('Cookie', student.session)
          .send({ title: 'Student quiz', scope: 'STANDALONE' })
          .expect(403);
        expect(response.body.code).toBe('FORBIDDEN_RESOURCE');
      }
    });

    it('blocks a student even on a standalone quiz they authored', async () => {
      // e.g. an instructor later demoted to student.
      const [quiz] = await t.db.query(
        `INSERT INTO quizzes(title, created_by, scope) VALUES ('Mine', $1, 'STANDALONE')
         RETURNING id`,
        [student.id],
      );
      const detail = QUIZ_ROUTES[0]!;
      expect(
        (
          await send(
            detail,
            { quizId: quiz.id, questionId: '', optionIds: [] },
            student.session,
          ).expect(403)
        ).body.code,
      ).toBe('FORBIDDEN_RESOURCE');
    });

    it('requires a session at all', async () => {
      for (const route of QUIZ_ROUTES)
        await send(route, quizzes.LESSON).expect(401);
    });
  });
});
