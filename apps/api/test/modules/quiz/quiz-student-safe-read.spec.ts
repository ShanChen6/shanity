import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

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

// Answer keys, explanations, question content and authoring metadata.
const FORBIDDEN_KEYS = [
  'isCorrect',
  'is_correct',
  'correctOptionId',
  'correctOptionIds',
  'explanation',
  'questions',
  'options',
  'createdBy',
  'created_by',
  'createdAt',
  'updatedAt',
  'updated_at',
  'version',
  'shuffleQuestions',
  'shuffleOptions',
  'author',
  'attemptCount',
];
const expectNoLeak = (payload: unknown) => {
  const keys = new Set(allKeys(payload));
  expect(FORBIDDEN_KEYS.filter((key) => keys.has(key))).toEqual([]);
  // `status` may only be the learner's own badge, never authoring state.
  expect(JSON.stringify(payload)).not.toMatch(/"(DRAFT|PUBLISHED|ARCHIVED)"/);
  // Belt and braces: no secret value reached the payload under another name.
  expect(JSON.stringify(payload)).not.toMatch(/SECRET|Option A|Why:/);
};

describe('Q12 student discovery and safe read API', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let student: Account;
  let outsider: Account;
  let course: Awaited<ReturnType<typeof t.course>>;
  let otherCourse: Awaited<ReturnType<typeof t.course>>;
  // Unique per run: the test database is shared with other suites.
  const tag = `q12${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    t = await learningApp('quiz-q12');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    outsider = await t.account();
    course = await t.course(owner, 2, [student]);
    otherCourse = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  const call = (
    method: 'post' | 'put' | 'delete',
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
  const get = (path: string, session = student.session) =>
    t.http().get(path).set('Cookie', session);

  /** A quiz with two questions whose keys and explanations are secret. */
  async function quiz(
    settings: {
      scope?: string;
      targetId?: string | null;
      slug?: string;
      title?: string;
      isRequired?: boolean;
      publish?: boolean;
    } = {},
  ) {
    const { publish = true, scope = 'STANDALONE', ...rest } = settings;
    const created = await call('post', '/admin/quizzes', owner.session, {
      title: `${tag} quiz`,
      scope,
      ...(scope === 'STANDALONE' && { slug: `${tag}-${randomUUID()}` }),
      description: 'Overview only',
      passingScore: 70,
      durationMinutes: 15,
      maxAttempts: 3,
      reviewPolicy: 'AFTER_PASS',
      gradingPolicy: 'LATEST',
      ...rest,
    }).expect(201);
    const quizId = created.body.id as string;
    for (const points of [10, 30])
      await call('post', `/admin/quizzes/${quizId}/questions`, owner.session, {
        content: `SECRET question worth ${points}`,
        points,
        explanation: 'Why: SECRET explanation',
        options: [
          { content: 'Option A SECRET', isCorrect: true },
          { content: 'Option B SECRET' },
        ],
      }).expect(201);
    if (publish)
      await call('post', `/admin/quizzes/${quizId}/publish`).expect(200);
    return { id: quizId, slug: created.body.slug as string | null };
  }

  describe('data leakage', () => {
    it('returns the standalone overview without any answer data at any depth', async () => {
      const published = await quiz({ title: `${tag} detail` });
      const response = await get(
        `/quizzes/standalone/${published.slug}`,
      ).expect(200);

      expect(response.headers['cache-control']).toBe('private, no-store');
      expectNoLeak(response.body);
      expect(response.body).toEqual({
        id: published.id,
        slug: published.slug,
        title: `${tag} detail`,
        description: 'Overview only',
        passingScore: 70,
        durationMinutes: 15,
        maxAttempts: 3,
        totalQuestions: 2,
        difficulty: null,
        tags: [],
        totalAttempts: 0,
        publishedAt: expect.any(String),
        scope: 'STANDALONE',
        isRequired: false,
        totalPoints: 40,
        reviewPolicy: 'AFTER_PASS',
        gradingPolicy: 'LATEST',
        attemptsUsed: 0,
        attemptsRemaining: 3,
        hasActiveAttempt: false,
        isPassed: false,
        highestPercentage: null,
        latestResult: null,
      });
    });

    it('keeps the discovery list and the course list free of answer data', async () => {
      await quiz({ title: `${tag} listed` });
      const list = await get(
        `/quizzes/standalone?search=${tag}%20listed`,
      ).expect(200);
      expect(list.body.quizzes).toHaveLength(1);
      expectNoLeak(list.body);

      await quiz({ scope: 'COURSE', targetId: otherCourse.id });
      const courseList = await get(`/courses/${otherCourse.id}/quizzes`).expect(
        200,
      );
      expect(courseList.body.quizzes).toHaveLength(1);
      expectNoLeak(courseList.body);
    });
  });

  describe('draft discovery', () => {
    it('answers 403 QUIZ_FORBIDDEN for a DRAFT slug, like a missing one', async () => {
      const draft = await quiz({ publish: false });
      const forbidden = await get(`/quizzes/standalone/${draft.slug}`).expect(
        403,
      );
      expect(forbidden.body).toMatchObject({
        statusCode: 403,
        code: 'QUIZ_FORBIDDEN',
      });
      expectNoLeak(forbidden.body);

      // Indistinguishable from a slug that never existed.
      const missing = await get(
        `/quizzes/standalone/${tag}-never-created`,
      ).expect(403);
      expect(missing.body).toEqual(forbidden.body);
    });

    it('hides archived and newly reopened versions too', async () => {
      const archived = await quiz();
      await call('delete', `/admin/quizzes/${archived.id}`).expect(200);
      await get(`/quizzes/standalone/${archived.slug}`).expect(403);

      const reopened = await quiz();
      await call('post', `/admin/quizzes/${reopened.id}/versions`).expect(201);
      await get(`/quizzes/standalone/${reopened.slug}`).expect(403);
    });

    it('never serves a course-bound quiz through the standalone route', async () => {
      const bound = await quiz({
        scope: 'COURSE',
        targetId: course.id,
        slug: `${tag}-bound`,
      });
      await get(`/quizzes/standalone/${bound.slug}`).expect(403);
    });

    it('requires a slug before a standalone quiz can be published', async () => {
      const created = await call('post', '/admin/quizzes', owner.session, {
        title: `${tag} slugless`,
        scope: 'STANDALONE',
      }).expect(201);
      await call(
        'post',
        `/admin/quizzes/${created.body.id}/questions`,
        owner.session,
        {
          content: 'Q',
          options: [{ content: 'A', isCorrect: true }, { content: 'B' }],
        },
      ).expect(201);
      const rejected = await call(
        'post',
        `/admin/quizzes/${created.body.id}/publish`,
      ).expect(422);
      expect(rejected.body.issues).toEqual([
        { code: 'STANDALONE_QUIZ_REQUIRES_SLUG' },
      ]);
    });
  });

  describe('GET /quizzes/standalone', () => {
    it('lists only published standalone quizzes, paginated and searchable', async () => {
      const first = await quiz({ title: `${tag} catalog one` });
      const second = await quiz({ title: `${tag} catalog two` });
      await quiz({ title: `${tag} catalog draft`, publish: false });
      await quiz({
        title: `${tag} catalog bound`,
        scope: 'COURSE',
        targetId: course.id,
      });

      const all = await get(
        `/quizzes/standalone?search=${tag}%20catalog`,
      ).expect(200);
      // Newest publication first.
      expect(all.body.quizzes.map((row: { id: string }) => row.id)).toEqual([
        second.id,
        first.id,
      ]);
      expect(all.body.pagination).toEqual({
        page: 1,
        limit: 20,
        totalItems: 2,
        totalPages: 1,
      });

      const paged = await get(
        `/quizzes/standalone?search=${tag}%20catalog&page=2&limit=1`,
      ).expect(200);
      expect(paged.body.quizzes.map((row: { id: string }) => row.id)).toEqual([
        first.id,
      ]);

      await get('/quizzes/standalone?limit=101').expect(400);
      await get('/quizzes/standalone?unknown=1').expect(400);
    });

    it('requires a session', async () => {
      await t.http().get('/quizzes/standalone').expect(401);
      await t.http().get('/quizzes/standalone/anything').expect(401);
      await t.http().get(`/courses/${course.id}/quizzes`).expect(401);
    });
  });

  describe('GET /courses/:courseId/quizzes', () => {
    it('lists published course-bound quizzes in curriculum order with the learner standing', async () => {
      const lessonQuiz = await quiz({
        scope: 'LESSON',
        targetId: course.lessons[1]!.id,
        title: `${tag} lesson 2`,
        isRequired: true,
      });
      const chapterQuiz = await quiz({
        scope: 'CHAPTER',
        targetId: course.chapterId,
        title: `${tag} chapter`,
      });
      const finalQuiz = await quiz({
        scope: 'COURSE',
        targetId: course.id,
        title: `${tag} final`,
      });
      const firstLessonQuiz = await quiz({
        scope: 'LESSON',
        targetId: course.lessons[0]!.id,
        title: `${tag} lesson 1`,
      });
      await quiz({ scope: 'COURSE', targetId: course.id, publish: false });
      await quiz({ title: `${tag} standalone` });

      await call(
        'post',
        `/quizzes/${firstLessonQuiz.id}/attempts`,
        student.session,
      ).expect(201);

      const response = await get(`/courses/${course.id}/quizzes`).expect(200);
      expectNoLeak(response.body);
      const ids = response.body.quizzes.map((row: { id: string }) => row.id);
      // The bound quiz from the slug test is also a COURSE quiz here.
      expect(ids.slice(0, 3)).toEqual([
        firstLessonQuiz.id,
        lessonQuiz.id,
        chapterQuiz.id,
      ]);
      expect(ids).toContain(finalQuiz.id);
      expect(ids).toHaveLength(
        new Set(ids).size, // no duplicates
      );
      expect(
        response.body.quizzes.every(
          (row: { scope: string }) => row.scope !== 'STANDALONE',
        ),
      ).toBe(true);

      const byId = (id: string) =>
        response.body.quizzes.find((row: { id: string }) => row.id === id);
      expect(byId(firstLessonQuiz.id)).toMatchObject({
        scope: 'LESSON',
        targetId: course.lessons[0]!.id,
        attemptsUsed: 1,
        attemptsRemaining: 2,
        hasActiveAttempt: true,
        isPassed: false,
        totalQuestions: 2,
      });
      expect(byId(lessonQuiz.id)).toMatchObject({
        isRequired: true,
        attemptsUsed: 0,
        hasActiveAttempt: false,
      });
    });

    it('requires an active enrollment, except for the course staff', async () => {
      const denied = await get(
        `/courses/${course.id}/quizzes`,
        outsider.session,
      ).expect(403);
      expect(denied.body.code).toBe('ENROLLMENT_REQUIRED');

      await t.db.query(
        `UPDATE enrollments SET revoked_at = now()
         WHERE user_id = $1 AND course_id = $2`,
        [student.id, otherCourse.id],
      );
      const suspended = await get(`/courses/${otherCourse.id}/quizzes`).expect(
        403,
      );
      expect(suspended.body.code).toBe('ENROLLMENT_SUSPENDED');

      await get(`/courses/${course.id}/quizzes`, owner.session).expect(200);
      const missing = await get(`/courses/${randomUUID()}/quizzes`).expect(404);
      expect(missing.body.code).toBe('COURSE_NOT_FOUND');
      await get('/courses/not-a-uuid/quizzes').expect(404);
    });
  });
});
