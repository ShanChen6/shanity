import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import type { CreateQuizDto } from '../../../src/modules/quiz/dto/quiz-authoring.dto.js';
import { QuizScope } from '../../../src/modules/quiz/entities/quiz.entity.js';
import { QuizAuthoringService } from '../../../src/modules/quiz/services/quiz-authoring.service.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

describe('Q6 quiz authoring CRUD', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let otherInstructor: Account;
  let student: Account;
  let admin: Account;
  let course: Awaited<ReturnType<typeof t.course>>;
  // Unique per run: the database is shared with other suites.
  const tag = `q6-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    t = await learningApp('quiz-q6');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    otherInstructor = await t.account('instructor');
    student = await t.account();
    admin = await t.account();
    await t.db.query(
      `INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'admin')`,
      [admin.id],
    );
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  const lessonId = () => course.lessons[0]!.id;
  const request = (
    method: 'post' | 'put' | 'delete' | 'get',
    path: string,
    session: string,
    body?: object,
  ) => {
    const call = t
      .http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', session);
    return body ? call.send(body) : call;
  };
  const create = (session: string, body: object) =>
    request('post', '/admin/quizzes', session, body);
  const lessonQuiz = async (overrides: object = {}) =>
    (
      await create(owner.session, {
        title: `${tag} lesson quiz`,
        scope: 'LESSON',
        targetId: lessonId(),
        ...overrides,
      }).expect(201)
    ).body as { id: string } & Record<string, unknown>;
  const row = async (id: string) =>
    (
      await t.db.query(
        `SELECT status, version, created_by AS "createdBy", title,
           scope, target_id AS "targetId", max_attempts AS "maxAttempts"
         FROM quizzes WHERE id = $1`,
        [id],
      )
    )[0] as Record<string, unknown> | undefined;

  describe('anti mass-assignment', () => {
    it('rejects system fields on create and creates nothing', async () => {
      const title = `${tag} malicious`;
      for (const extra of [
        { status: 'PUBLISHED' },
        { version: 99 },
        { createdBy: otherInstructor.id },
        { created_by: otherInstructor.id },
        { id: randomUUID() },
        { rating: 5 },
      ]) {
        const response = await create(owner.session, {
          title,
          scope: 'LESSON',
          targetId: lessonId(),
          ...extra,
        }).expect(400);
        expect(JSON.stringify(response.body.message)).toContain(
          Object.keys(extra)[0],
        );
      }
      const [{ count }] = await t.db.query(
        'SELECT count(*)::int AS count FROM quizzes WHERE title = $1',
        [title],
      );
      expect(count).toBe(0);
    });

    it('still forces DRAFT, version 1 and the caller as author past the pipe', async () => {
      // Simulates a payload that slipped past validation (e.g. a relaxed
      // pipe): explicit mapping must still ignore every system field.
      const payload = {
        title: `${tag} smuggled`,
        scope: QuizScope.LESSON,
        targetId: lessonId(),
        status: 'PUBLISHED',
        version: 99,
        createdBy: otherInstructor.id,
        id: randomUUID(),
      } as unknown as CreateQuizDto;
      const created = await t.app
        .get(QuizAuthoringService)
        .create({ id: owner.id, roles: ['instructor'] } as never, payload);

      expect(created).toMatchObject({
        status: 'DRAFT',
        version: 1,
        createdBy: owner.id,
      });
      expect(created.id).not.toBe((payload as unknown as { id: string }).id);
      expect(await row(created.id)).toMatchObject({
        status: 'DRAFT',
        version: 1,
        createdBy: owner.id,
      });
    });

    it('rejects system fields and the binding on update', async () => {
      const quiz = await lessonQuiz();
      const course2 = await t.course(owner, 1);
      for (const body of [
        { status: 'PUBLISHED' },
        { version: 7 },
        { createdBy: otherInstructor.id },
        { scope: 'STANDALONE' },
        { targetId: course2.lessons[0]!.id },
      ])
        await request(
          'put',
          `/admin/quizzes/${quiz.id}`,
          owner.session,
          body,
        ).expect(400);
      expect(await row(quiz.id)).toMatchObject({
        status: 'DRAFT',
        version: 1,
        createdBy: owner.id,
        scope: 'LESSON',
        targetId: lessonId(),
      });
    });
  });

  describe('scope and target on create', () => {
    it('creates a lesson quiz as a DRAFT with defaults', async () => {
      const response = await create(owner.session, {
        title: `  ${tag} Lesson quiz  `,
        slug: `${tag}-lesson-quiz`,
        scope: 'LESSON',
        targetId: lessonId(),
      }).expect(201);

      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body).toMatchObject({
        title: `${tag} Lesson quiz`,
        slug: `${tag}-lesson-quiz`,
        scope: 'LESSON',
        targetId: lessonId(),
        courseId: course.id,
        status: 'DRAFT',
        version: 1,
        passingScore: 80,
        maxAttempts: null,
        durationMinutes: null,
        isRequired: false,
        reviewPolicy: 'AFTER_SUBMIT',
        gradingPolicy: 'HIGHEST',
        shuffleQuestions: true,
        shuffleOptions: true,
        createdBy: owner.id,
        author: { id: owner.id, displayName: 'instructor' },
        attemptCount: 0,
        questions: [],
      });
    });

    it('creates chapter, course and standalone quizzes', async () => {
      for (const [scope, targetId] of [
        ['CHAPTER', course.chapterId],
        ['COURSE', course.id],
        ['STANDALONE', null],
      ] as const)
        await create(owner.session, {
          title: `${tag} ${scope}`,
          scope,
          targetId,
        }).expect(201);
    });

    it('rejects a contextual quiz without a target', async () => {
      for (const body of [
        { targetId: null },
        {},
        { targetId: 'not-a-uuid' },
        { targetId: course.chapterId },
      ]) {
        const response = await create(owner.session, {
          title: `${tag} no target`,
          scope: 'LESSON',
          ...body,
        }).expect(400);
        if ('targetId' in body && body.targetId !== 'not-a-uuid')
          expect(response.body.code).toBe('INVALID_TARGET_LESSON');
      }
    });

    it('rejects a standalone quiz that carries a target', async () => {
      const response = await create(owner.session, {
        title: `${tag} standalone`,
        scope: 'STANDALONE',
        targetId: lessonId(),
      }).expect(400);
      expect(response.body.code).toBe('STANDALONE_QUIZ_CANNOT_HAVE_TARGET');
      expect(
        (
          await create(owner.session, {
            title: `${tag} standalone`,
            scope: 'STANDALONE',
            isRequired: true,
          }).expect(400)
        ).body.code,
      ).toBe('STANDALONE_QUIZ_CANNOT_BE_REQUIRED');
    });

    it('refuses targets in a course the instructor does not teach', async () => {
      const body = {
        title: `${tag} foreign`,
        scope: 'LESSON',
        targetId: lessonId(),
      };
      expect(
        (await create(otherInstructor.session, body).expect(403)).body.code,
      ).toBe('TARGET_COURSE_FORBIDDEN');
      await create(student.session, body).expect(403);
      await create(admin.session, body).expect(201);
    });

    it('validates settings and slug uniqueness', async () => {
      const base = { title: `${tag} settings`, scope: 'STANDALONE' };
      for (const invalid of [
        { title: 'ab' },
        { title: 'x'.repeat(256) },
        { passingScore: 101 },
        { passingScore: -1 },
        { maxAttempts: 0 },
        { durationMinutes: 0 },
        { reviewPolicy: 'SOMETIMES' },
        { slug: 'Not A Slug' },
        { scope: 'ORGANIZATION' },
      ])
        await create(owner.session, { ...base, ...invalid }).expect(400);

      const slug = `${tag}-unique`;
      await create(owner.session, { ...base, slug }).expect(201);
      expect(
        (await create(owner.session, { ...base, slug }).expect(409)).body.code,
      ).toBe('QUIZ_SLUG_TAKEN');
    });
  });

  describe('read', () => {
    it('returns the full authoring view, answer key included', async () => {
      const quiz = await lessonQuiz();
      const [question] = await t.db.query(
        `INSERT INTO quiz_questions(quiz_id, content, explanation)
         VALUES ($1, '2 + 2 = ?', 'Basic sums') RETURNING id`,
        [quiz.id],
      );
      await t.db.query(
        `INSERT INTO quiz_options(question_id, content, position, is_correct)
         VALUES ($1, '4', 1, true), ($1, '5', 2, false)`,
        [question.id],
      );

      const response = await request(
        'get',
        `/admin/quizzes/${quiz.id}`,
        owner.session,
      ).expect(200);
      expect(response.body.questions).toEqual([
        expect.objectContaining({
          explanation: 'Basic sums',
          options: [
            expect.objectContaining({ content: '4', isCorrect: true }),
            expect.objectContaining({ content: '5', isCorrect: false }),
          ],
        }),
      ]);
      await request(
        'get',
        `/admin/quizzes/${quiz.id}`,
        otherInstructor.session,
      ).expect(403);
      await request('get', `/admin/quizzes/${quiz.id}`, student.session).expect(
        403,
      );
      await request('get', `/admin/quizzes/${quiz.id}`, admin.session).expect(
        200,
      );
    });

    it('lists only manageable quizzes, with filters and pagination', async () => {
      const listTag = `${tag}-list-${randomUUID().slice(0, 6)}`;
      const own = await create(owner.session, {
        title: `${listTag} lesson`,
        scope: 'LESSON',
        targetId: lessonId(),
      }).expect(201);
      await create(owner.session, {
        title: `${listTag} chapter`,
        scope: 'CHAPTER',
        targetId: course.chapterId,
      }).expect(201);
      const standalone = await create(owner.session, {
        title: `${listTag} standalone`,
        scope: 'STANDALONE',
      }).expect(201);
      const archived = await create(owner.session, {
        title: `${listTag} archived`,
        scope: 'COURSE',
        targetId: course.id,
      }).expect(201);
      await t.db.query(`UPDATE quizzes SET status='ARCHIVED' WHERE id=$1`, [
        archived.body.id,
      ]);

      const list = async (session: string, query: Record<string, string>) =>
        (
          await t
            .http()
            .get('/admin/quizzes')
            .query({ search: listTag, ...query })
            .set('Cookie', session)
            .expect(200)
        ).body as {
          quizzes: Array<{
            id: string;
            title: string;
            courseId: string | null;
          }>;
          pagination: { totalItems: number; totalPages: number };
        };
      const titles = (body: Awaited<ReturnType<typeof list>>) =>
        body.quizzes.map(({ title }) => title).sort();

      const mine = await list(owner.session, {});
      expect(titles(mine)).toEqual(
        [
          `${listTag} chapter`,
          `${listTag} lesson`,
          `${listTag} standalone`,
        ].sort(),
      );
      expect(mine.quizzes.find(({ id }) => id === own.body.id)?.courseId).toBe(
        course.id,
      );
      expect(mine.pagination.totalItems).toBe(3);

      expect((await list(otherInstructor.session, {})).quizzes).toEqual([]);
      expect(titles(await list(admin.session, {}))).toHaveLength(3);
      expect(
        titles(await list(owner.session, { scope: 'STANDALONE' })),
      ).toEqual([`${listTag} standalone`]);
      expect(titles(await list(owner.session, { status: 'ARCHIVED' }))).toEqual(
        [`${listTag} archived`],
      );
      expect(
        titles(await list(owner.session, { courseId: course.id })),
      ).not.toContain(`${listTag} standalone`);
      const paged = await list(owner.session, { limit: '2', page: '2' });
      expect(paged.quizzes).toHaveLength(1);
      expect(paged.pagination).toMatchObject({ totalItems: 3, totalPages: 2 });
      expect(standalone.body.courseId).toBeNull();

      await t
        .http()
        .get('/admin/quizzes')
        .query({ limit: '1000' })
        .set('Cookie', owner.session)
        .expect(400);
      await t
        .http()
        .get('/admin/quizzes')
        .set('Cookie', student.session)
        .expect(403);
    });
  });

  describe('update and delete policy', () => {
    it('updates a DRAFT quiz field by field', async () => {
      const quiz = await lessonQuiz({ maxAttempts: 3 });
      const response = await request(
        'put',
        `/admin/quizzes/${quiz.id}`,
        owner.session,
        {
          title: `${tag} renamed`,
          passingScore: 60,
          maxAttempts: null,
          durationMinutes: 15,
          reviewPolicy: 'AFTER_PASS',
          shuffleOptions: false,
        },
      ).expect(200);
      expect(response.body).toMatchObject({
        title: `${tag} renamed`,
        passingScore: 60,
        maxAttempts: null,
        durationMinutes: 15,
        reviewPolicy: 'AFTER_PASS',
        shuffleOptions: false,
        shuffleQuestions: true,
        status: 'DRAFT',
        version: 1,
      });
      expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(quiz.updatedAt as string).getTime(),
      );

      await request('put', `/admin/quizzes/${quiz.id}`, owner.session, {
        title: null,
      }).expect(400);
      await request(
        'put',
        `/admin/quizzes/${quiz.id}`,
        otherInstructor.session,
        {
          title: `${tag} hijack`,
        },
      ).expect(403);
      expect((await row(quiz.id))?.title).toBe(`${tag} renamed`);
    });

    it('refuses in-place edits of a published quiz', async () => {
      const quiz = await lessonQuiz();
      await t.db.query(`UPDATE quizzes SET status='PUBLISHED' WHERE id=$1`, [
        quiz.id,
      ]);
      const response = await request(
        'put',
        `/admin/quizzes/${quiz.id}`,
        owner.session,
        { title: `${tag} too late` },
      ).expect(409);
      expect(response.body.code).toBe('QUIZ_NOT_EDITABLE');
    });

    it('hard-deletes an unattempted draft with its questions', async () => {
      const quiz = await lessonQuiz();
      await t.db.query(
        `INSERT INTO quiz_questions(quiz_id, content) VALUES ($1, 'Q')`,
        [quiz.id],
      );
      const response = await request(
        'delete',
        `/admin/quizzes/${quiz.id}`,
        owner.session,
      ).expect(200);
      expect(response.body).toEqual({
        id: quiz.id,
        outcome: 'DELETED',
        status: null,
      });
      expect(await row(quiz.id)).toBeUndefined();
      const [{ count }] = await t.db.query(
        'SELECT count(*)::int AS count FROM quiz_questions WHERE quiz_id=$1',
        [quiz.id],
      );
      expect(count).toBe(0);
    });

    it('archives a quiz that learners have attempted, keeping history', async () => {
      const quiz = await lessonQuiz();
      const [attempt] = await t.db.query(
        `INSERT INTO quiz_attempts(user_id, quiz_id, quiz_version, attempt_number,
           quiz_snapshot, status, submitted_at, score, is_passed,
           earned_points, total_points, percentage)
         VALUES ($1, $2, 1, 1, '{"questions": []}', 'SUBMITTED', now(), 90, true,
           9, 10, 90)
         RETURNING id`,
        [student.id, quiz.id],
      );

      const response = await request(
        'delete',
        `/admin/quizzes/${quiz.id}`,
        owner.session,
      ).expect(200);
      expect(response.body).toEqual({
        id: quiz.id,
        outcome: 'ARCHIVED',
        status: 'ARCHIVED',
      });
      expect((await row(quiz.id))?.status).toBe('ARCHIVED');
      const [kept] = await t.db.query(
        'SELECT score FROM quiz_attempts WHERE id=$1',
        [attempt.id],
      );
      expect(kept.score).toBe(90);

      // Repeating the delete is a no-op, and archived quizzes are read-only.
      await request(
        'delete',
        `/admin/quizzes/${quiz.id}`,
        owner.session,
      ).expect(200);
      await request('put', `/admin/quizzes/${quiz.id}`, owner.session, {
        title: `${tag} revived`,
      }).expect(409);
      await request(
        'delete',
        `/admin/quizzes/${quiz.id}`,
        otherInstructor.session,
      ).expect(403);
    });
  });
});
