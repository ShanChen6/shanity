import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = { id: string; options: Array<{ id: string }> };

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

describe('Q14 answer persistence and resume', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q14');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  /** Q1 single choice, Q2 multiple choice; fixed order, 30 minutes. */
  async function quiz() {
    const send = (path: string, body?: object) =>
      t.send('post', path, owner.session, body);
    const created = await send('/admin/quizzes', {
      title: 'Q14',
      scope: 'LESSON',
      targetId: course.lessons[0]!.id,
      durationMinutes: 30,
      shuffleQuestions: false,
      shuffleOptions: false,
    }).expect(201);
    const id = created.body.id as string;
    const q1 = (
      await send(`/admin/quizzes/${id}/questions`, {
        content: 'Q1',
        explanation: 'Why Q1',
        options: [{ content: 'A', isCorrect: true }, { content: 'B' }],
      }).expect(201)
    ).body as Question;
    const q2 = (
      await send(`/admin/quizzes/${id}/questions`, {
        content: 'Q2',
        type: 'MULTIPLE_CHOICE',
        options: [
          { content: 'X', isCorrect: true },
          { content: 'Y', isCorrect: true },
          { content: 'Z' },
        ],
      }).expect(201)
    ).body as Question;
    await send(`/admin/quizzes/${id}/publish`).expect(200);
    return { id, q1, q2 };
  }

  const start = (session: string, quizId: string) =>
    t
      .http()
      .post(`/quizzes/${quizId}/attempts`)
      .set('Origin', origin)
      .set('Cookie', session);
  const resume = (session: string, quizId: string) =>
    t.http().get(`/quizzes/${quizId}/active-attempt`).set('Cookie', session);
  const save = (session: string, attemptId: string, body: object) =>
    t
      .http()
      .put(`/quiz-attempts/${attemptId}/answers`)
      .set('Origin', origin)
      .set('Cookie', session)
      .send(body);
  const storedAnswers = (attemptId: string) =>
    t.db.query<
      Array<{ questionId: string; selectedOptionIds: string[]; savedAt: Date }>
    >(
      `SELECT question_id AS "questionId",
         selected_option_ids AS "selectedOptionIds", saved_at AS "savedAt"
       FROM attempt_answers WHERE attempt_id = $1 ORDER BY question_id`,
      [attemptId],
    );

  describe('auto-save and multi-device resume', () => {
    it('shows an answer chosen on device 1 when device 2 resumes', async () => {
      const { id, q1, q2 } = await quiz();
      const started = await start(student.session, id).expect(201);
      const attemptId = started.body.id as string;

      // Device 1 picks Q1 = A.
      const saved = await save(student.session, attemptId, {
        questionId: q1.id,
        selectedOptionId: q1.options[0]!.id,
      }).expect(200);
      expect(saved.body).toEqual({
        questionId: q1.id,
        selectedOptionId: q1.options[0]!.id,
        selectedOptionIds: [q1.options[0]!.id],
        savedAt: expect.any(String),
      });

      // Device 2: a separate login session of the same learner.
      const device2 = await t.login(student.email);
      const resumed = await resume(device2, id).expect(200);
      expect(resumed.headers['cache-control']).toBe('private, no-store');
      expect(resumed.body).toMatchObject({
        id: attemptId,
        status: 'IN_PROGRESS',
        expiresAt: started.body.expiresAt,
      });
      expect(resumed.body.answers).toEqual([
        {
          questionId: q1.id,
          selectedOptionId: q1.options[0]!.id,
          selectedOptionIds: [q1.options[0]!.id],
          savedAt: saved.body.savedAt,
        },
      ]);
      // The snapshot comes back in this attempt's order, answer key stripped.
      expect(
        resumed.body.quiz.questions.map((q: { id: string }) => q.id),
      ).toEqual([q1.id, q2.id]);
      expect(resumed.body.quiz.questions).toEqual(started.body.quiz.questions);
      for (const key of [
        'isCorrect',
        'is_correct',
        'explanation',
        'quizSnapshot',
      ])
        expect(allKeys(resumed.body)).not.toContain(key);

      // Device 2 continues; device 1 sees it on its next resume.
      await save(device2, attemptId, {
        questionId: q2.id,
        selectedOptionIds: [q2.options[0]!.id, q2.options[1]!.id],
      }).expect(200);
      const back = await resume(student.session, id).expect(200);
      expect(back.body.answers).toHaveLength(2);
      expect(
        back.body.answers.find(
          (a: { questionId: string }) => a.questionId === q2.id,
        ),
      ).toMatchObject({
        selectedOptionId: null,
        selectedOptionIds: [q2.options[0]!.id, q2.options[1]!.id],
      });
    });

    it('UPSERTs one row per question, last write wins, stamped by the server', async () => {
      const { id, q1 } = await quiz();
      const attemptId = (await start(student.session, id).expect(201)).body
        .id as string;

      const first = await save(student.session, attemptId, {
        questionId: q1.id,
        selectedOptionId: q1.options[0]!.id,
      }).expect(200);
      const second = await save(student.session, attemptId, {
        questionId: q1.id,
        selectedOptionId: q1.options[1]!.id,
      }).expect(200);

      const rows = await storedAnswers(attemptId);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.selectedOptionIds).toEqual([q1.options[1]!.id]);
      expect(rows[0]!.savedAt.toISOString()).toBe(second.body.savedAt);
      expect(Date.parse(second.body.savedAt)).toBeGreaterThan(
        Date.parse(first.body.savedAt),
      );

      // Clearing is a save too.
      await save(student.session, attemptId, {
        questionId: q1.id,
        selectedOptionIds: [],
      })
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            selectedOptionId: null,
            selectedOptionIds: [],
          }),
        );
    });
  });

  describe('invalid answers', () => {
    it('answers 400 INVALID_OPTION_FOR_QUESTION for an option outside the question', async () => {
      const { id, q1, q2 } = await quiz();
      const attemptId = (await start(student.session, id).expect(201)).body
        .id as string;

      for (const selectedOptionId of [q2.options[0]!.id, randomUUID()]) {
        const response = await save(student.session, attemptId, {
          questionId: q1.id,
          selectedOptionId,
        }).expect(400);
        expect(response.body).toMatchObject({
          statusCode: 400,
          code: 'INVALID_OPTION_FOR_QUESTION',
        });
      }
      const mixed = await save(student.session, attemptId, {
        questionId: q2.id,
        selectedOptionIds: [q2.options[0]!.id, q1.options[0]!.id],
      }).expect(400);
      expect(mixed.body.code).toBe('INVALID_OPTION_FOR_QUESTION');
      expect(await storedAnswers(attemptId)).toEqual([]);
    });

    it('validates the question and the shape of the selection', async () => {
      const { id, q1 } = await quiz();
      const attemptId = (await start(student.session, id).expect(201)).body
        .id as string;
      const code = async (body: object) =>
        (await save(student.session, attemptId, body).expect(400)).body.code;

      expect(
        await code({
          questionId: randomUUID(),
          selectedOptionId: randomUUID(),
        }),
      ).toBe('QUESTION_NOT_IN_SNAPSHOT');
      // Two options on a single choice question, or both fields at once.
      expect(
        await code({
          questionId: q1.id,
          selectedOptionIds: q1.options.map((option) => option.id),
        }),
      ).toBe('INVALID_RESPONSE_TYPE');
      expect(
        await code({
          questionId: q1.id,
          selectedOptionId: q1.options[0]!.id,
          selectedOptionIds: [q1.options[0]!.id],
        }),
      ).toBe('INVALID_RESPONSE_TYPE');
      // Malformed bodies fail validation.
      await save(student.session, attemptId, { questionId: q1.id }).expect(400);
      await save(student.session, attemptId, {
        questionId: q1.id,
        selectedOptionId: 'not-a-uuid',
      }).expect(400);
      expect(await storedAnswers(attemptId)).toEqual([]);
    });

    it("hides other learners' attempts and freezes submitted ones", async () => {
      const { id, q1 } = await quiz();
      const attemptId = (await start(student.session, id).expect(201)).body
        .id as string;
      const answer = { questionId: q1.id, selectedOptionId: q1.options[0]!.id };

      const other = await t.account();
      await t.db.query(
        'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
        [other.id, course.id],
      );
      const hidden = await save(other.session, attemptId, answer).expect(404);
      expect(hidden.body.code).toBe('ATTEMPT_NOT_FOUND');

      await t
        .http()
        .post(`/quiz-attempts/${attemptId}/submit`)
        .set('Origin', origin)
        .set('Cookie', student.session)
        .expect(200);
      const closed = await save(student.session, attemptId, answer).expect(409);
      expect(closed.body.code).toBe('ATTEMPT_NOT_IN_PROGRESS');
      await t
        .http()
        .put(`/quiz-attempts/${attemptId}/answers`)
        .set('Cookie', student.session)
        .send(answer)
        .expect(403); // Origin
    });
  });
});
