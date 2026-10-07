import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { QuizAttemptsService } from '../../src/modules/quiz/services/quiz-attempts.service.js';
import type { Account } from '../support/learning-fixture.js';
import {
  ANSWER_KEYS,
  allKeys,
  quizEngine,
  type Course,
} from './quiz-e2e-support.js';

/** Sprint 7 security and integrity gate: 11 hard checks. */
describe('Quiz engine security audit', () => {
  let e: Awaited<ReturnType<typeof quizEngine>>;
  let instructorA: Account;
  let instructorB: Account;
  let enrolled: Account;
  let course: Course;

  beforeAll(async () => {
    e = await quizEngine('quiz-security-audit');
    instructorA = await e.account('instructor');
    instructorB = await e.account('instructor');
    enrolled = await e.account();
    course = await e.course(instructorA, 1, [enrolled]);
  });
  afterAll(() => e?.app.close());
  afterEach(() => vi.restoreAllMocks());

  /** A learner enrolled in no course at all. */
  const outsider = async () => {
    const account = await e.account();
    const [{ count }] = await e.db.query(
      'SELECT count(*)::int AS count FROM enrollments WHERE user_id = $1',
      [account.id],
    );
    expect(count).toBe(0);
    return account;
  };
  const snapshotOf = async (attemptId: string) =>
    (
      await e.db.query(
        'SELECT quiz_snapshot AS s FROM quiz_attempts WHERE id = $1',
        [attemptId],
      )
    )[0].s;

  it('1. blocks students from every authoring route (403 FORBIDDEN)', async () => {
    const quiz = await e.publishedQuiz(instructorA, 'LESSON', course);
    const student = e.as(enrolled);
    const attempts = [
      student('post', '/admin/quizzes', { title: 'Hack', scope: 'STANDALONE' }),
      student('get', '/admin/quizzes'),
      student('get', `/admin/quizzes/${quiz.id}`),
      student('put', `/admin/quizzes/${quiz.id}`, { title: 'Hacked' }),
      student('delete', `/admin/quizzes/${quiz.id}`),
      student('post', `/admin/quizzes/${quiz.id}/publish`),
      student('post', `/admin/quizzes/${quiz.id}/versions`),
      student('get', `/admin/quizzes/${quiz.id}/questions`),
      student('post', `/admin/quizzes/${quiz.id}/questions`, { content: 'x' }),
      student('patch', `/admin/quizzes/${quiz.id}/questions/reorder`, {
        items: [{ id: quiz.q1.id, position: 1 }],
      }),
      student('put', `/admin/quizzes/${quiz.id}/questions/${quiz.q1.id}`, {
        points: 99,
      }),
      student('delete', `/admin/quizzes/${quiz.id}/questions/${quiz.q1.id}`),
      student('put', `/admin/options/${quiz.q1.options[1]!.id}`, {
        isCorrect: true,
      }),
      student('delete', `/admin/options/${quiz.q1.options[1]!.id}`),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe('FORBIDDEN_RESOURCE');
    }
    const view = await e
      .as(instructorA)('get', `/admin/quizzes/${quiz.id}`)
      .expect(200);
    expect(view.body).toMatchObject({
      title: 'E2E LESSON',
      status: 'PUBLISHED',
    });
    expect(view.body.questions).toHaveLength(2);
  });

  it("2. isolates instructors: B gets 403 on A's quizzes, never 404", async () => {
    const other = e.as(instructorB);
    for (const scope of ['LESSON', 'STANDALONE'] as const) {
      const quiz = await e.draftQuiz(instructorA, scope, course);
      const responses = await Promise.all([
        other('get', `/admin/quizzes/${quiz.id}`),
        other('put', `/admin/quizzes/${quiz.id}`, { title: 'Stolen' }),
        other('delete', `/admin/quizzes/${quiz.id}`),
        other('post', `/admin/quizzes/${quiz.id}/publish`),
        other('post', `/admin/quizzes/${quiz.id}/questions`, { content: 'x' }),
        other('put', `/admin/options/${quiz.q1.options[1]!.id}`, {
          isCorrect: true,
        }),
      ]);
      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(['QUIZ_FORBIDDEN', 'TARGET_COURSE_FORBIDDEN']).toContain(
          response.body.code,
        );
      }
      const view = await e
        .as(instructorA)('get', `/admin/quizzes/${quiz.id}`)
        .expect(200);
      expect(view.body).toMatchObject({
        status: 'DRAFT',
        title: `E2E ${scope}`,
      });
    }
    // An id that does not exist looks exactly like someone else's.
    const missing = await other('get', `/admin/quizzes/${randomUUID()}`).expect(
      403,
    );
    expect(missing.body.code).toBe('QUIZ_FORBIDDEN');
  });

  it('3. protects course-bound quizzes from unenrolled learners (403 TARGET_COURSE_FORBIDDEN)', async () => {
    const learner = e.as(await outsider());
    for (const scope of ['LESSON', 'CHAPTER', 'COURSE'] as const) {
      const quiz = await e.publishedQuiz(instructorA, scope, course);
      const denied = await learner(
        'post',
        `/quizzes/${quiz.id}/attempts`,
      ).expect(403);
      expect(denied.body.code).toBe('TARGET_COURSE_FORBIDDEN');
      await learner('get', `/courses/${course.id}/quizzes`).expect(403);
    }
  });

  it('4. lets a learner with no enrollment take a STANDALONE quiz', async () => {
    const learner = e.as(await outsider());
    const quiz = await e.publishedQuiz(instructorA, 'STANDALONE', course);
    await learner('get', `/quizzes/standalone/${quiz.slug}`).expect(200);
    const started = await learner(
      'post',
      `/quizzes/${quiz.id}/attempts`,
    ).expect(201);
    await learner('put', `/quiz-attempts/${started.body.id}/answers`, {
      questionId: quiz.q1.id,
      selectedOptionId: quiz.q1.options[0]!.id,
    }).expect(200);
    await learner('post', `/quiz-attempts/${started.body.id}/submit`).expect(
      200,
    );
    await learner('get', `/quiz-attempts/${started.body.id}/result`).expect(
      200,
    );
  });

  it('5. refuses to start a DRAFT quiz (403 QUIZ_FORBIDDEN)', async () => {
    for (const scope of ['LESSON', 'STANDALONE'] as const) {
      const draft = await e.draftQuiz(instructorA, scope, course);
      const denied = await e
        .as(enrolled)('post', `/quizzes/${draft.id}/attempts`)
        .expect(403);
      expect(denied.body.code).toBe('QUIZ_FORBIDDEN');
      if (draft.slug)
        expect(
          (
            await e
              .as(enrolled)('get', `/quizzes/standalone/${draft.slug}`)
              .expect(403)
          ).body.code,
        ).toBe('QUIZ_FORBIDDEN');
    }
  });

  it('6. never leaks the answer key or explanations to learners', async () => {
    const learner = e.as(enrolled);
    const standalone = await e.publishedQuiz(instructorA, 'STANDALONE', course);
    const lesson = await e.publishedQuiz(instructorA, 'LESSON', course);
    const payloads = [
      (
        await learner('get', `/quizzes/standalone/${standalone.slug}`).expect(
          200,
        )
      ).body,
      (await learner('get', '/quizzes/standalone').expect(200)).body,
      (await learner('get', `/courses/${course.id}/quizzes`).expect(200)).body,
      (await learner('get', `/quizzes/${lesson.id}/take`).expect(200)).body,
      (await learner('post', `/quizzes/${standalone.id}/attempts`).expect(201))
        .body,
      (
        await learner('get', `/quizzes/${standalone.id}/active-attempt`).expect(
          200,
        )
      ).body,
      (await learner('post', `/quizzes/${lesson.id}/attempts`).expect(201))
        .body,
      (await learner('get', `/quizzes/${lesson.id}/active-attempt`).expect(200))
        .body,
      (await learner('get', '/my-quiz-attempts').expect(200)).body,
    ];
    for (const payload of payloads) {
      for (const key of ANSWER_KEYS)
        expect(allKeys(payload)).not.toContain(key);
      expect(JSON.stringify(payload)).not.toContain('SECRET');
      expect(allKeys(payload)).not.toContain('quizSnapshot');
    }
  });

  it('7. ignores forged scores: the server grades', async () => {
    const quiz = await e.publishedQuiz(instructorA, 'STANDALONE', course);
    const learner = e.as(enrolled);
    const attemptId = (
      await learner('post', `/quizzes/${quiz.id}/attempts`).expect(201)
    ).body.id as string;
    // Score fields in an answer are rejected outright.
    await learner('put', `/quiz-attempts/${attemptId}/answers`, {
      questionId: quiz.q1.id,
      selectedOptionId: quiz.q1.options[1]!.id,
      isCorrect: true,
      score: 100,
    }).expect(400);
    await learner('put', `/quiz-attempts/${attemptId}/answers`, {
      questionId: quiz.q1.id,
      selectedOptionId: quiz.q1.options[1]!.id,
    }).expect(200);
    const submitted = await learner(
      'post',
      `/quiz-attempts/${attemptId}/submit`,
      {
        score: 100,
        earnedPoints: 30,
        totalPoints: 30,
        percentage: 100,
        passed: true,
        isPassed: true,
      },
    );
    expect([200, 400]).toContain(submitted.status);
    const [row] = await e.db.query(
      `SELECT status, earned_points AS "earnedPoints", percentage, is_passed AS "isPassed"
       FROM quiz_attempts WHERE id = $1`,
      [attemptId],
    );
    if (submitted.status === 400) expect(row.status).toBe('IN_PROGRESS');
    else
      expect(row).toEqual({
        status: 'SUBMITTED',
        earnedPoints: 0,
        percentage: '0.00',
        isPassed: false,
      });
  });

  it('8. enforces maxAttempts (409 MAX_ATTEMPTS_REACHED)', async () => {
    const quiz = await e.publishedQuiz(instructorA, 'COURSE', course, {
      maxAttempts: 1,
    });
    const learner = e.as(enrolled);
    const attemptId = (
      await learner('post', `/quizzes/${quiz.id}/attempts`).expect(201)
    ).body.id as string;
    await learner('post', `/quiz-attempts/${attemptId}/submit`).expect(200);
    const denied = await learner('post', `/quizzes/${quiz.id}/attempts`).expect(
      409,
    );
    expect(denied.body.code).toBe('MAX_ATTEMPTS_REACHED');
  });

  it('9. enforces the server timer (400 ATTEMPT_EXPIRED, then TIMED_OUT)', async () => {
    const quiz = await e.publishedQuiz(instructorA, 'STANDALONE', course, {
      durationMinutes: 10,
    });
    const learner = e.as(enrolled);
    const started = await learner(
      'post',
      `/quizzes/${quiz.id}/attempts`,
    ).expect(201);
    await e.db.query(
      `UPDATE quiz_attempts SET expires_at = started_at + interval '1 millisecond'
       WHERE id = $1`,
      [started.body.id],
    );
    // A client clock claiming it is still early changes nothing.
    const late = await learner(
      'put',
      `/quiz-attempts/${started.body.id}/answers`,
      {
        questionId: quiz.q1.id,
        selectedOptionId: quiz.q1.options[0]!.id,
      },
    )
      .set('Date', new Date(Date.parse(started.body.startedAt)).toUTCString())
      .set('X-Client-Time', started.body.startedAt)
      .expect(400);
    expect(late.body).toMatchObject({
      code: 'ATTEMPT_EXPIRED',
      notice: 'ATTEMPT_TIMED_OUT',
      attempt: { status: 'TIMED_OUT' },
    });
    const [{ status }] = await e.db.query(
      'SELECT status FROM quiz_attempts WHERE id = $1',
      [started.body.id],
    );
    expect(status).toBe('TIMED_OUT');
  });

  it('10. grades exactly once under 10 simultaneous submits', async () => {
    const quiz = await e.publishedQuiz(instructorA, 'CHAPTER', course);
    const learner = e.as(enrolled);
    const attemptId = (
      await learner('post', `/quizzes/${quiz.id}/attempts`).expect(201)
    ).body.id as string;
    await learner('put', `/quiz-attempts/${attemptId}/answers`, {
      questionId: quiz.q1.id,
      selectedOptionId: quiz.q1.options[0]!.id,
    }).expect(200);
    const grading = vi.spyOn(
      QuizAttemptsService.prototype as unknown as {
        gradeAndClose: (...args: unknown[]) => Promise<unknown>;
      },
      'gradeAndClose',
    );

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        learner('post', `/quiz-attempts/${attemptId}/submit`),
      ),
    );
    expect(grading).toHaveBeenCalledTimes(1);
    const results = responses.filter(({ status }) => status === 200);
    for (const response of responses)
      if (response.status !== 200) {
        expect(response.status).toBe(409);
        expect(response.body.code).toBe('SUBMISSION_IN_PROGRESS');
      }
    expect(results.length).toBeGreaterThan(0);
    const stripped = results.map(({ body }) => ({
      ...body,
      serverNow: undefined,
    }));
    for (const body of stripped) expect(body).toEqual(stripped[0]);
    // Retries after the storm get the same single result.
    const retry = await learner(
      'post',
      `/quiz-attempts/${attemptId}/submit`,
    ).expect(200);
    expect({ ...retry.body, serverNow: undefined }).toEqual(stripped[0]);
    expect(grading).toHaveBeenCalledTimes(1);
    const [{ graded }] = await e.db.query(
      `SELECT count(*)::int AS graded FROM attempt_answers
       WHERE attempt_id = $1 AND is_correct IS NOT NULL`,
      [attemptId],
    );
    expect(graded).toBe(1);
  });

  it('11. keeps past attempts immune to authoring changes, even wiping the questions', async () => {
    const quiz = await e.publishedQuiz(instructorA, 'LESSON', course);
    const learner = e.as(enrolled);
    const attemptId = (
      await learner('post', `/quizzes/${quiz.id}/attempts`).expect(201)
    ).body.id as string;
    await learner('put', `/quiz-attempts/${attemptId}/answers`, {
      questionId: quiz.q1.id,
      selectedOptionId: quiz.q1.options[0]!.id,
    }).expect(200);
    await learner('post', `/quiz-attempts/${attemptId}/submit`).expect(200);
    const before = (
      await learner('get', `/quiz-attempts/${attemptId}/result`).expect(200)
    ).body;
    const snapshot = await snapshotOf(attemptId);

    // Mutate, then wipe, the live authoring rows behind the API's back.
    await e.db.query(
      `UPDATE quiz_options SET is_correct = NOT is_correct, content = 'MUTATED'
       WHERE question_id IN (SELECT id FROM quiz_questions WHERE quiz_id = $1)`,
      [quiz.id],
    );
    await e.db.query(
      `UPDATE quiz_questions SET content = 'MUTATED', points = 999 WHERE quiz_id = $1`,
      [quiz.id],
    );
    await e.db.query(`UPDATE quizzes SET passing_score = 100 WHERE id = $1`, [
      quiz.id,
    ]);
    await e.db.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [
      quiz.id,
    ]);
    const [{ live }] = await e.db.query(
      'SELECT count(*)::int AS live FROM quiz_questions WHERE quiz_id = $1',
      [quiz.id],
    );
    expect(live).toBe(0);

    expect(await snapshotOf(attemptId)).toEqual(snapshot);
    const after = (
      await learner('get', `/quiz-attempts/${attemptId}/result`).expect(200)
    ).body;
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain('MUTATED');
    // The snapshot itself cannot be rewritten either.
    await expect(
      e.db.query(
        `UPDATE quiz_attempts SET quiz_snapshot = '{}' WHERE id = $1`,
        [attemptId],
      ),
    ).rejects.toMatchObject({ code: '23000' });
  });
});
