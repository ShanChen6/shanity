import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { GRACE_PERIOD_SECONDS } from '../../../src/modules/quiz/services/quiz-attempts.service.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = { id: string; options: Array<{ id: string }> };

describe('Q15 server-authoritative timer and expiration', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q15');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  /** Two 10-point single choice questions, 10 minutes, option 0 correct. */
  async function quiz() {
    const send = (path: string, body?: object) =>
      t.send('post', path, owner.session, body);
    const created = await send('/admin/quizzes', {
      title: 'Q15',
      scope: 'LESSON',
      targetId: course.lessons[0]!.id,
      durationMinutes: 10,
      passingScore: 50,
      shuffleQuestions: false,
      shuffleOptions: false,
    }).expect(201);
    const id = created.body.id as string;
    const questions: Question[] = [];
    for (const content of ['Q1', 'Q2'])
      questions.push(
        (
          await send(`/admin/quizzes/${id}/questions`, {
            content,
            points: 10,
            options: [
              { content: 'Right', isCorrect: true },
              { content: 'Wrong' },
            ],
          }).expect(201)
        ).body as Question,
      );
    await send(`/admin/quizzes/${id}/publish`).expect(200);
    return { id, q1: questions[0]!, q2: questions[1]! };
  }

  const start = (quizId: string) =>
    t
      .http()
      .post(`/quizzes/${quizId}/attempts`)
      .set('Origin', origin)
      .set('Cookie', student.session);
  const resume = (quizId: string) =>
    t
      .http()
      .get(`/quizzes/${quizId}/active-attempt`)
      .set('Cookie', student.session);
  const save = (attemptId: string, question: Question, body: object = {}) =>
    t
      .http()
      .put(`/quiz-attempts/${attemptId}/answers`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({
        questionId: question.id,
        selectedOptionId: question.options[0]!.id,
        ...body,
      });
  const submit = (attemptId: string) =>
    t
      .http()
      .post(`/quiz-attempts/${attemptId}/submit`)
      .set('Origin', origin)
      .set('Cookie', student.session);
  const row = async (attemptId: string) =>
    (
      await t.db.query(
        `SELECT status, score, is_passed AS "isPassed",
           submitted_at = expires_at AS "submittedAtDeadline",
           extract(epoch FROM submitted_at - expires_at) AS "lateBy"
         FROM quiz_attempts WHERE id = $1`,
        [attemptId],
      )
    )[0] as {
      status: string;
      score: number | null;
      isPassed: boolean | null;
      submittedAtDeadline: boolean | null;
      lateBy: string | null;
    };

  /**
   * Moves a running attempt's whole time window into the past so that its
   * deadline was `secondsAgo` seconds ago on the database clock. started_at
   * and expires_at are immutable by design, so the row is re-inserted with
   * the same id, snapshot and saved answers.
   */
  async function expireAgo(attemptId: string, secondsAgo: number) {
    await t.db.transaction(async (manager) => {
      const answers = await manager.query(
        `SELECT question_id, selected_option_ids, saved_at
         FROM attempt_answers WHERE attempt_id = $1`,
        [attemptId],
      );
      await manager.query(
        `WITH old AS (DELETE FROM quiz_attempts WHERE id = $1 RETURNING *)
         INSERT INTO quiz_attempts(id, user_id, quiz_id, quiz_version,
           attempt_number, quiz_snapshot, started_at, expires_at)
         SELECT id, user_id, quiz_id, quiz_version, attempt_number,
           quiz_snapshot,
           clock_timestamp() - (expires_at - started_at)
             - make_interval(secs => $2),
           clock_timestamp() - make_interval(secs => $2)
         FROM old`,
        [attemptId, secondsAgo],
      );
      for (const answer of answers)
        await manager.query(
          `INSERT INTO attempt_answers(attempt_id, question_id,
             selected_option_ids, saved_at)
           VALUES ($1, $2, $3, clock_timestamp() - make_interval(secs => $4) - interval '1 second')`,
          [
            attemptId,
            answer.question_id,
            answer.selected_option_ids,
            secondsAgo,
          ],
        );
    });
  }

  it('fixes expiresAt = startedAt + durationMinutes at creation', async () => {
    const { id } = await quiz();
    const started = await start(id).expect(201);
    expect(
      Date.parse(started.body.expiresAt) - Date.parse(started.body.startedAt),
    ).toBe(10 * 60 * 1000);
    // Resuming never moves the deadline.
    const resumed = await resume(id).expect(200);
    expect(resumed.body.expiresAt).toBe(started.body.expiresAt);
    await submit(started.body.id).expect(200);
  });

  describe('browser clock tamper immunity', () => {
    it('ignores client timestamps and uses only the database clock', async () => {
      const { id, q1 } = await quiz();
      const farFuture = new Date(Date.now() + 365 * 24 * 3600 * 1000);
      const started = await start(id)
        .set('Date', farFuture.toUTCString())
        .set('X-Client-Time', farFuture.toISOString())
        .expect(201);
      const attemptId = started.body.id as string;

      // Time fields in the body are not accepted at all.
      for (const field of ['savedAt', 'clientTime', 'expiresAt'])
        await save(attemptId, q1, { [field]: farFuture.toISOString() }).expect(
          400,
        );

      const saved = await save(attemptId, q1)
        .set('Date', new Date(0).toUTCString())
        .expect(200);
      const [{ dbNow }] = await t.db.query('SELECT now() AS "dbNow"');
      for (const stamp of [
        saved.body.savedAt,
        started.body.startedAt,
        started.body.serverNow,
      ])
        expect(
          Math.abs(Date.parse(stamp) - (dbNow as Date).getTime()),
        ).toBeLessThan(10_000);

      // A client claiming it is still early cannot reopen an expired attempt.
      await expireAgo(attemptId, 60);
      const late = await save(attemptId, q1)
        .set('Date', new Date(Date.parse(started.body.startedAt)).toUTCString())
        .set('X-Client-Time', started.body.startedAt)
        .expect(400);
      expect(late.body.code).toBe('ATTEMPT_EXPIRED');
    });
  });

  describe('timeout enforcement at every touchpoint', () => {
    it('refuses a late answer and auto-submits the answers saved in time', async () => {
      const { id, q1, q2 } = await quiz();
      const attemptId = (await start(id).expect(201)).body.id as string;
      await save(attemptId, q1).expect(200);
      await expireAgo(attemptId, 60);

      const late = await save(attemptId, q2).expect(400);
      expect(late.body).toMatchObject({
        statusCode: 400,
        code: 'ATTEMPT_EXPIRED',
        notice: 'ATTEMPT_TIMED_OUT',
        attempt: {
          id: attemptId,
          status: 'TIMED_OUT',
          notice: 'ATTEMPT_TIMED_OUT',
          score: 50,
          isPassed: true,
        },
      });
      // Only Q1, saved before the deadline, was graded; Q2 never stored.
      expect(await row(attemptId)).toMatchObject({
        status: 'TIMED_OUT',
        score: 50,
        submittedAtDeadline: true,
      });
      const answers = await t.db.query(
        `SELECT question_id AS "questionId", is_correct AS "isCorrect"
         FROM attempt_answers WHERE attempt_id = $1`,
        [attemptId],
      );
      expect(answers).toEqual([{ questionId: q1.id, isCorrect: true }]);

      // The attempt stays closed for every later call.
      const again = await save(attemptId, q2).expect(409);
      expect(again.body.code).toBe('ATTEMPT_NOT_IN_PROGRESS');
      const submitted = await submit(attemptId).expect(200);
      expect(submitted.body).toMatchObject({
        status: 'TIMED_OUT',
        notice: 'ATTEMPT_TIMED_OUT',
        score: 50,
      });
    });

    it('auto-submits on resume past the deadline', async () => {
      const { id, q1 } = await quiz();
      const attemptId = (await start(id).expect(201)).body.id as string;
      await save(attemptId, q1, {
        selectedOptionId: q1.options[1]!.id,
      }).expect(200);
      await expireAgo(attemptId, 1);

      const resumed = await resume(id).expect(200);
      expect(resumed.body).toMatchObject({
        id: attemptId,
        status: 'TIMED_OUT',
        notice: 'ATTEMPT_TIMED_OUT',
        score: 0,
        isPassed: false,
      });
      expect(resumed.body.quiz).toBeUndefined();
      expect(await row(attemptId)).toMatchObject({ submittedAtDeadline: true });
      await resume(id).expect(404);
    });

    it('auto-submits on start past the deadline before opening a new attempt', async () => {
      const { id } = await quiz();
      const first = (await start(id).expect(201)).body.id as string;
      await expireAgo(first, 30);
      const second = await start(id).expect(201);
      expect(second.body).toMatchObject({ attemptNumber: 2 });
      expect(await row(first)).toMatchObject({
        status: 'TIMED_OUT',
        submittedAtDeadline: true,
      });
      await submit(second.body.id).expect(200);
    });
  });

  describe('grace period', () => {
    it(`accepts a submit ${3}s after expires_at (grace ${GRACE_PERIOD_SECONDS}s)`, async () => {
      const { id, q1, q2 } = await quiz();
      const attemptId = (await start(id).expect(201)).body.id as string;
      await save(attemptId, q1).expect(200);
      await save(attemptId, q2).expect(200);
      await expireAgo(attemptId, 3);

      const response = await submit(attemptId).expect(200);
      expect(response.body).toMatchObject({
        status: 'SUBMITTED',
        score: 100,
        isPassed: true,
      });
      expect(response.body.notice).toBeUndefined();
      const stored = await row(attemptId);
      expect(stored.status).toBe('SUBMITTED');
      expect(Number(stored.lateBy)).toBeGreaterThan(0);
      expect(Number(stored.lateBy)).toBeLessThanOrEqual(GRACE_PERIOD_SECONDS);
    });

    it('times out a submit after the grace period, stamped at the deadline', async () => {
      const { id, q1 } = await quiz();
      const attemptId = (await start(id).expect(201)).body.id as string;
      await save(attemptId, q1).expect(200);
      await expireAgo(attemptId, GRACE_PERIOD_SECONDS + 5);

      const response = await submit(attemptId).expect(200);
      expect(response.body).toMatchObject({
        status: 'TIMED_OUT',
        notice: 'ATTEMPT_TIMED_OUT',
        score: 50,
      });
      expect(await row(attemptId)).toMatchObject({
        status: 'TIMED_OUT',
        submittedAtDeadline: true,
      });
    });

    it('gives no grace to autosaves', async () => {
      const { id, q1 } = await quiz();
      const attemptId = (await start(id).expect(201)).body.id as string;
      await expireAgo(attemptId, 2);
      expect((await save(attemptId, q1).expect(400)).body.code).toBe(
        'ATTEMPT_EXPIRED',
      );
    });
  });
});
