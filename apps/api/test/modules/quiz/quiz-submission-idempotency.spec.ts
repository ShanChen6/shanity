import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import {
  QuizAttemptsService,
  SUBMISSION_LEASE_SECONDS,
} from '../../../src/modules/quiz/services/quiz-attempts.service.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = { id: string; options: Array<{ id: string }> };

describe('Q16 submission and idempotency', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q16');
    // Listen once so parallel requests share one port.
    await t.app.listen(0);
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());
  afterEach(() => vi.restoreAllMocks());

  // Every run of the grading pipeline goes through this one method.
  const gradingRuns = () =>
    vi.spyOn(
      QuizAttemptsService.prototype as unknown as {
        gradeAndClose: (...args: unknown[]) => Promise<unknown>;
      },
      'gradeAndClose',
    );

  /** Q1 (10 pts) and Q2 (30 pts), option 0 correct; 30 minutes. */
  async function quiz() {
    const send = (path: string, body?: object) =>
      t.send('post', path, owner.session, body);
    const created = await send('/admin/quizzes', {
      title: 'Q16',
      scope: 'LESSON',
      targetId: course.lessons[0]!.id,
      durationMinutes: 30,
      passingScore: 50,
    }).expect(201);
    const id = created.body.id as string;
    const questions: Question[] = [];
    for (const points of [10, 30])
      questions.push(
        (
          await send(`/admin/quizzes/${id}/questions`, {
            content: `Worth ${points}`,
            points,
            options: [
              { content: 'Right', isCorrect: true },
              { content: 'Wrong' },
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
  ) => {
    const pending = t
      .http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', student.session);
    return body ? pending.send(body) : pending;
  };
  const submit = (attemptId: string) =>
    call('post', `/quiz-attempts/${attemptId}/submit`);

  /** A started attempt with Q1 right and Q2 wrong: 10 of 40 points. */
  async function answered() {
    const { id, questions } = await quiz();
    const attemptId = (
      await call('post', `/quizzes/${id}/attempts`).expect(201)
    ).body.id as string;
    await call('put', `/quiz-attempts/${attemptId}/answers`, {
      questionId: questions[0]!.id,
      selectedOptionId: questions[0]!.options[0]!.id,
    }).expect(200);
    await call('put', `/quiz-attempts/${attemptId}/answers`, {
      questionId: questions[1]!.id,
      selectedOptionId: questions[1]!.options[1]!.id,
    }).expect(200);
    return { quizId: id, attemptId, questions };
  }

  const stored = async (attemptId: string) => {
    const [attempt] = await t.db.query(
      `SELECT status, score, percentage, earned_points AS "earnedPoints",
         submitted_at AS "submittedAt", user_id AS "userId", quiz_id AS "quizId"
       FROM quiz_attempts WHERE id = $1`,
      [attemptId],
    );
    const [{ answers }] = await t.db.query(
      'SELECT count(*)::int AS answers FROM attempt_answers WHERE attempt_id = $1',
      [attemptId],
    );
    const [{ attempts }] = await t.db.query(
      `SELECT count(*)::int AS attempts FROM quiz_attempts
       WHERE user_id = $1 AND quiz_id = $2`,
      [attempt.userId, attempt.quizId],
    );
    return { ...attempt, answers, attempts };
  };

  describe('race conditions', () => {
    it('grades exactly once under 10 concurrent submits', async () => {
      const { attemptId } = await answered();
      const runs = gradingRuns();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => submit(attemptId)),
      );

      expect(runs).toHaveBeenCalledTimes(1);
      // Requests that met the claim are told so; the rest get the result.
      for (const response of responses) {
        if (response.status === 409)
          expect(response.body.code).toBe('SUBMISSION_IN_PROGRESS');
        else expect(response.status).toBe(200);
      }
      const results = responses.filter(({ status }) => status === 200);
      expect(results.length).toBeGreaterThanOrEqual(1);
      for (const { body } of results)
        expect(body).toMatchObject({
          id: attemptId,
          status: 'COMPLETED',
          earnedPoints: 10,
          totalPoints: 40,
          percentage: 25,
          score: 25,
          isPassed: false,
          submittedAt: results[0]!.body.submittedAt,
        });

      // One closed attempt, its answers neither duplicated nor regraded.
      expect(await stored(attemptId)).toMatchObject({
        status: 'COMPLETED',
        earnedPoints: 10,
        percentage: '25.00',
        answers: 2,
        attempts: 1,
      });
      // A retry after the storm returns the very same result, ungraded.
      const retry = await submit(attemptId).expect(200);
      expect(retry.body.submittedAt).toBe(results[0]!.body.submittedAt);
      expect(runs).toHaveBeenCalledTimes(1);
    });
  });

  describe('duplicate submits', () => {
    it('returns the stored result with 200 and never grades again', async () => {
      const { attemptId } = await answered();
      const runs = gradingRuns();
      const first = await submit(attemptId).expect(200);
      expect(runs).toHaveBeenCalledTimes(1);
      const before = await stored(attemptId);

      for (let i = 0; i < 3; i++) {
        const again = await submit(attemptId).expect(200);
        expect(again.body).toEqual({
          ...first.body,
          serverNow: expect.any(String),
        });
      }
      expect(runs).toHaveBeenCalledTimes(1);
      expect(await stored(attemptId)).toEqual(before);
    });
  });

  describe('the SUBMITTING state', () => {
    /** Leaves the attempt in a fresh SUBMITTING claim, as mid-grading. */
    const claim = (attemptId: string) =>
      t.db.query(
        `UPDATE quiz_attempts SET status = 'SUBMITTING' WHERE id = $1`,
        [attemptId],
      );

    it('answers 409 while another request holds the claim, everywhere', async () => {
      const { quizId, attemptId, questions } = await answered();
      await claim(attemptId);
      const runs = gradingRuns();

      const busy = await submit(attemptId).expect(409);
      expect(busy.body).toMatchObject({
        statusCode: 409,
        code: 'SUBMISSION_IN_PROGRESS',
      });
      // Answers are frozen, no new attempt can start, the result is not ready.
      expect(
        (
          await call('put', `/quiz-attempts/${attemptId}/answers`, {
            questionId: questions[0]!.id,
            selectedOptionIds: [],
          }).expect(409)
        ).body.code,
      ).toBe('ATTEMPT_NOT_IN_PROGRESS');
      expect(
        (await call('post', `/quizzes/${quizId}/attempts`).expect(409)).body
          .code,
      ).toBe('SUBMISSION_IN_PROGRESS');
      expect(
        (await call('get', `/quiz-attempts/${attemptId}/result`).expect(409))
          .body.code,
      ).toBe('SUBMISSION_IN_PROGRESS');
      const active = await call(
        'get',
        `/quizzes/${quizId}/active-attempt`,
      ).expect(200);
      expect(active.body).toMatchObject({
        id: attemptId,
        status: 'SUBMITTING',
      });
      expect(active.body.quiz).toBeUndefined();
      expect(runs).not.toHaveBeenCalled();
      expect((await stored(attemptId)).status).toBe('SUBMITTING');
    });

    it('finishes a claim abandoned past its lease, stamped at the claim', async () => {
      const { attemptId } = await answered();
      // A request claimed the attempt long ago and died before grading.
      // updated_at (the claim) is trigger-maintained, so re-insert the row;
      // its answers go with it, leaving nothing earned.
      await t.db.query('DELETE FROM attempt_answers WHERE attempt_id = $1', [
        attemptId,
      ]);
      await t.db.query(
        `WITH old AS (DELETE FROM quiz_attempts WHERE id = $1 RETURNING *)
         INSERT INTO quiz_attempts(id, user_id, quiz_id, quiz_version,
           attempt_number, quiz_snapshot, started_at, expires_at, status,
           updated_at)
         SELECT id, user_id, quiz_id, quiz_version, attempt_number,
           quiz_snapshot, started_at, expires_at, 'SUBMITTING',
           clock_timestamp() - make_interval(secs => $2)
         FROM old`,
        [attemptId, SUBMISSION_LEASE_SECONDS + 5],
      );
      const [{ claimedAt }] = await t.db.query(
        'SELECT updated_at AS "claimedAt" FROM quiz_attempts WHERE id = $1',
        [attemptId],
      );
      const runs = gradingRuns();

      const response = await submit(attemptId).expect(200);
      expect(response.body).toMatchObject({
        status: 'COMPLETED',
        earnedPoints: 0,
        totalPoints: 40,
      });
      expect(Date.parse(response.body.submittedAt)).toBe(
        (claimedAt as Date).getTime(),
      );
      expect(runs).toHaveBeenCalledTimes(1);
      await submit(attemptId).expect(200);
      expect(runs).toHaveBeenCalledTimes(1);
    });
  });
});
