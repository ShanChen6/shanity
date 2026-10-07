import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Scope = 'LESSON' | 'CHAPTER' | 'COURSE' | 'STANDALONE';

describe('Q13 unified start attempt engine', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q13');
    // Listen once so parallel requests share one port.
    await t.app.listen(0);
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  const targetOf = (scope: Scope) =>
    ({
      LESSON: course.lessons[0]!.id,
      CHAPTER: course.chapterId,
      COURSE: course.id,
      STANDALONE: null,
    })[scope];

  /** A published one-question quiz, authored through the API. */
  async function quiz(
    scope: Scope = 'LESSON',
    settings: { maxAttempts?: number | null; durationMinutes?: number } = {},
    publish = true,
  ) {
    const send = (path: string, body?: object) =>
      t.send('post', path, owner.session, body);
    const created = await send('/admin/quizzes', {
      title: `Q13 ${scope}`,
      scope,
      targetId: targetOf(scope),
      ...(scope === 'STANDALONE' && { slug: `q13-${randomUUID()}` }),
      ...settings,
    }).expect(201);
    const id = created.body.id as string;
    await send(`/admin/quizzes/${id}/questions`, {
      content: 'Pick A',
      options: [{ content: 'A', isCorrect: true }, { content: 'B' }],
    }).expect(201);
    if (publish) await send(`/admin/quizzes/${id}/publish`).expect(200);
    return id;
  }

  const start = (session: string, quizId: string) =>
    t
      .http()
      .post(`/quizzes/${quizId}/attempts`)
      .set('Origin', origin)
      .set('Cookie', session);
  const submit = (session: string, attemptId: string) =>
    t
      .http()
      .post(`/quiz-attempts/${attemptId}/submit`)
      .set('Origin', origin)
      .set('Cookie', session);
  const attempts = (userId: string, quizId: string) =>
    t.db.query<Array<{ id: string; attemptNumber: number; status: string }>>(
      `SELECT id, attempt_number AS "attemptNumber", status FROM quiz_attempts
       WHERE user_id = $1 AND quiz_id = $2 ORDER BY attempt_number`,
      [userId, quizId],
    );

  describe('access control', () => {
    it('rejects an unenrolled student on a LESSON quiz with 403 TARGET_COURSE_FORBIDDEN', async () => {
      const outsider = await t.account();
      const quizId = await quiz('LESSON');
      const response = await start(outsider.session, quizId).expect(403);
      expect(response.body).toMatchObject({
        statusCode: 403,
        code: 'TARGET_COURSE_FORBIDDEN',
        reason: 'ENROLLMENT_REQUIRED',
      });
      expect(await attempts(outsider.id, quizId)).toEqual([]);
    });

    it('applies the same enrollment rule to CHAPTER and COURSE quizzes', async () => {
      const outsider = await t.account();
      for (const scope of ['CHAPTER', 'COURSE'] as const) {
        const response = await start(
          outsider.session,
          await quiz(scope),
        ).expect(403);
        expect(response.body.code).toBe('TARGET_COURSE_FORBIDDEN');
      }
    });

    it('reports a suspended enrollment as TARGET_COURSE_FORBIDDEN', async () => {
      const suspended = await t.account();
      const other = await t.course(owner, 1, [suspended]);
      await t.db.query(
        'UPDATE enrollments SET revoked_at = now() WHERE user_id = $1 AND course_id = $2',
        [suspended.id, other.id],
      );
      const created = await t
        .send('post', '/admin/quizzes', owner.session, {
          title: 'Q13 suspended',
          scope: 'COURSE',
          targetId: other.id,
        })
        .expect(201);
      await t
        .send(
          'post',
          `/admin/quizzes/${created.body.id}/questions`,
          owner.session,
          {
            content: 'Q',
            options: [{ content: 'A', isCorrect: true }, { content: 'B' }],
          },
        )
        .expect(201);
      await t
        .send(
          'post',
          `/admin/quizzes/${created.body.id}/publish`,
          owner.session,
        )
        .expect(200);
      const response = await start(suspended.session, created.body.id).expect(
        403,
      );
      expect(response.body).toMatchObject({
        code: 'TARGET_COURSE_FORBIDDEN',
        reason: 'ENROLLMENT_SUSPENDED',
      });
    });

    it('answers 403 QUIZ_FORBIDDEN for drafts and unknown quizzes alike', async () => {
      const draft = await start(
        student.session,
        await quiz('LESSON', {}, false),
      ).expect(403);
      expect(draft.body.code).toBe('QUIZ_FORBIDDEN');
      const missing = await start(student.session, randomUUID()).expect(403);
      expect(missing.body).toEqual(draft.body);
    });

    it('lets enrolled students start every course-bound scope and anyone signed in a STANDALONE one', async () => {
      const outsider = await t.account();
      for (const scope of ['LESSON', 'CHAPTER', 'COURSE'] as const) {
        const response = await start(student.session, await quiz(scope)).expect(
          201,
        );
        expect(response.body).toMatchObject({
          status: 'IN_PROGRESS',
          attemptNumber: 1,
        });
      }
      const standalone = await quiz('STANDALONE');
      await start(outsider.session, standalone).expect(201);
      await t.http().post(`/quizzes/${standalone}/attempts`).expect(403); // Origin
      await t
        .http()
        .post(`/quizzes/${standalone}/attempts`)
        .set('Origin', origin)
        .expect(401);
    });
  });

  describe('resume and limits', () => {
    it('resumes the running attempt instead of creating another', async () => {
      const quizId = await quiz('LESSON', { durationMinutes: 30 });
      const first = await start(student.session, quizId).expect(201);
      const again = await start(student.session, quizId).expect(200);

      expect(again.body.id).toBe(first.body.id);
      expect(again.body.attemptNumber).toBe(1);
      expect(again.body.expiresAt).toBe(first.body.expiresAt);
      expect(again.body.quiz.questions).toEqual(first.body.quiz.questions);
      expect(await attempts(student.id, quizId)).toEqual([
        { id: first.body.id, attemptNumber: 1, status: 'IN_PROGRESS' },
      ]);
    });

    it('sets expires_at from durationMinutes on the database clock', async () => {
      const quizId = await quiz('COURSE', { durationMinutes: 20 });
      const started = await start(student.session, quizId).expect(201);
      const [row] = await t.db.query(
        `SELECT extract(epoch FROM expires_at - started_at)::int AS seconds
         FROM quiz_attempts WHERE id = $1`,
        [started.body.id],
      );
      expect(row.seconds).toBe(20 * 60);

      const untimed = await start(
        student.session,
        await quiz('CHAPTER'),
      ).expect(201);
      expect(untimed.body.expiresAt).toBeNull();
    });

    it('answers 409 MAX_ATTEMPTS_REACHED once the only attempt is submitted', async () => {
      const quizId = await quiz('LESSON', { maxAttempts: 1 });
      const first = await start(student.session, quizId).expect(201);
      await submit(student.session, first.body.id).expect(200);

      const response = await start(student.session, quizId).expect(409);
      expect(response.body).toMatchObject({
        statusCode: 409,
        code: 'MAX_ATTEMPTS_REACHED',
      });
      expect(await attempts(student.id, quizId)).toHaveLength(1);
    });

    it('counts a timed-out attempt towards the limit', async () => {
      const quizId = await quiz('LESSON', {
        maxAttempts: 1,
        durationMinutes: 5,
      });
      const first = await start(student.session, quizId).expect(201);
      // Past the deadline: the next start closes it as TIMED_OUT first.
      await t.db.query(
        `UPDATE quiz_attempts
         SET expires_at = started_at + interval '1 millisecond'
         WHERE id = $1`,
        [first.body.id],
      );
      const response = await start(student.session, quizId).expect(409);
      expect(response.body.code).toBe('MAX_ATTEMPTS_REACHED');
      expect(await attempts(student.id, quizId)).toEqual([
        { id: first.body.id, attemptNumber: 1, status: 'TIMED_OUT' },
      ]);
    });

    it('never exceeds maxAttempts when two tabs start at once', async () => {
      const racer = await t.account();
      const quizId = await quiz('STANDALONE', { maxAttempts: 2 });
      const first = await start(racer.session, quizId).expect(201);
      await submit(racer.session, first.body.id).expect(200);

      // One slot left: of the parallel starts, exactly one creates attempt 2
      // and the rest resume it.
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => start(racer.session, quizId)),
      );
      expect(
        responses.map(({ status }) => status).sort((a, b) => a - b),
      ).toEqual([200, 200, 200, 200, 200, 201]);
      expect(new Set(responses.map(({ body }) => body.id)).size).toBe(1);
      const rows = await attempts(racer.id, quizId);
      expect(rows.map(({ attemptNumber }) => attemptNumber)).toEqual([1, 2]);

      // With that one submitted too, parallel starts are all refused.
      await submit(racer.session, rows[1]!.id).expect(200);
      const refused = await Promise.all(
        Array.from({ length: 4 }, () => start(racer.session, quizId)),
      );
      expect(refused.map(({ status }) => status)).toEqual([409, 409, 409, 409]);
      expect(await attempts(racer.id, quizId)).toHaveLength(2);
    });
  });
});
