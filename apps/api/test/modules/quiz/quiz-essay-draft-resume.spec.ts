import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type StartedQuestion = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'ESSAY';
  options: Array<{ id: string }>;
};

describe('Sprint 9 E6-E8 essay draft autosave and resume', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;
  let origin: string;

  const env = {
    CLOUDINARY_CLOUD_NAME: 'demo-cloud',
    CLOUDINARY_API_KEY: 'key-123',
    CLOUDINARY_API_SECRET: 'secret-xyz',
  };
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const name of Object.keys(env)) saved[name] = process.env[name];
    Object.assign(process.env, env);
  });
  afterAll(() => {
    for (const [name, value] of Object.entries(saved))
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  });

  beforeAll(async () => {
    t = await learningApp('quiz-essay-draft');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  async function startAttempt() {
    const [quiz] = await t.db.query(
      `INSERT INTO quizzes(
         title, slug, created_by, scope, target_id, status, published_at,
         passing_score, is_required, shuffle_questions, shuffle_options
       ) VALUES ('Draft quiz', $1, $2, 'LESSON', $3, 'PUBLISHED', now(), 80,
         false, false, false)
       RETURNING id`,
      [`draft-${randomUUID()}`, owner.id, course.lessons[0]!.id],
    );
    const [mcq] = await t.db.query(
      `INSERT INTO quiz_questions(quiz_id, type, content, position, points)
       VALUES ($1, 'MULTIPLE_CHOICE', 'MCQ', 1, 10) RETURNING id`,
      [quiz.id],
    );
    await t.db.query(
      `INSERT INTO quiz_options(question_id, content, position, is_correct)
       VALUES ($1, 'Right', 1, true), ($1, 'Wrong', 2, false)`,
      [mcq.id],
    );
    await t.db.query(
      `INSERT INTO quiz_questions(quiz_id, type, content, position, points,
         essay_config)
       VALUES ($1, 'ESSAY', 'Essay', 2, 10, $2::jsonb)`,
      [
        quiz.id,
        JSON.stringify({
          allowedSubmissionTypes: ['TEXT_WITH_KATEX', 'FILE_UPLOAD'],
          maxFileUploads: 2,
          maxWords: 3,
          rubric: [{ criterion: 'Reasoning', maxPoints: 10 }],
        }),
      ],
    );
    const started = await t
      .http()
      .post(`/quizzes/${quiz.id}/attempts`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .expect(201);
    const questions = started.body.quiz.questions as StartedQuestion[];
    return {
      attemptId: started.body.id as string,
      mcq: questions.find(({ type }) => type === 'MULTIPLE_CHOICE')!,
      essay: questions.find(({ type }) => type === 'ESSAY')!,
    };
  }

  const draft = (attemptId: string, body: object, session = student.session) =>
    t
      .http()
      .patch(`/quiz-attempts/${attemptId}/answers/draft`)
      .set('Origin', origin)
      .set('Cookie', session)
      .send(body);
  const fetchAttempt = (attemptId: string, session = student.session) =>
    t.http().get(`/quiz-attempts/${attemptId}`).set('Cookie', session);

  const attachment = {
    url: 'https://res.cloudinary.com/demo-cloud/image/upload/scratch.png',
    filename: 'scratch.png',
    mimeType: 'image/png',
    size: 2048,
  };

  it('upserts repeated essay drafts into a single quiz answer row', async () => {
    const { attemptId, essay } = await startAttempt();

    for (const text of ['a', 'a b', 'a b c $x^2$'])
      await draft(attemptId, {
        questionId: essay.id,
        essayAnswer: { text },
      }).expect(200);
    await draft(attemptId, {
      questionId: essay.id,
      essayAnswer: { text: 'final', attachments: [attachment] },
    }).expect(200);

    const rows = (await t.db.query(
      `SELECT essay_answer AS "essayAnswer", grading
       FROM attempt_answers WHERE attempt_id = $1 AND question_id = $2`,
      [attemptId, essay.id],
    )) as Array<{ essayAnswer: unknown; grading: unknown }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      essayAnswer: { text: 'final', attachments: [attachment] },
      grading: null,
    });

    // Drafting never grades or closes the attempt.
    const [attempt] = await t.db.query(
      'SELECT status, score, submitted_at FROM quiz_attempts WHERE id = $1',
      [attemptId],
    );
    expect(attempt).toMatchObject({
      status: 'IN_PROGRESS',
      score: null,
      submitted_at: null,
    });
  });

  it('returns text, attachments and MCQ selections when the attempt is fetched', async () => {
    const { attemptId, mcq, essay } = await startAttempt();
    await draft(attemptId, {
      questionId: mcq.id,
      selectedOptionIds: [mcq.options[0]!.id],
    }).expect(200);
    await draft(attemptId, {
      questionId: essay.id,
      essayAnswer: { text: 'Derive $E=mc^2$', attachments: [attachment] },
    }).expect(200);

    const response = await fetchAttempt(attemptId).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.status).toBe('IN_PROGRESS');
    const byQuestion = new Map(
      (response.body.answers as Array<{ questionId: string }>).map((a) => [
        a.questionId,
        a,
      ]),
    );
    expect(byQuestion.get(mcq.id)).toMatchObject({
      selectedOptionIds: [mcq.options[0]!.id],
    });
    expect(byQuestion.get(essay.id)).toMatchObject({
      selectedOptionIds: [],
      essayAnswer: { text: 'Derive $E=mc^2$', attachments: [attachment] },
    });
    // The grading guide never reaches the learner.
    expect(JSON.stringify(response.body)).not.toContain('rubric');
  });

  it('accepts an empty or over-limit essay draft (limits apply at submit)', async () => {
    const { attemptId, essay } = await startAttempt();
    // maxWords is 3: a draft may exceed it while the learner is editing.
    await draft(attemptId, {
      questionId: essay.id,
      essayAnswer: { text: 'one two three four five' },
    }).expect(200);
    const cleared = await draft(attemptId, {
      questionId: essay.id,
      essayAnswer: {},
    }).expect(200);
    expect(cleared.body.essayAnswer).toEqual({});
  });

  it('refuses drafts for foreign attempts, bad shapes and closed attempts', async () => {
    const { attemptId, mcq, essay } = await startAttempt();
    const other = await t.account();
    await draft(
      attemptId,
      { questionId: essay.id, essayAnswer: { text: 'x' } },
      other.session,
    ).expect(404);
    await fetchAttempt(attemptId, other.session).expect(404);

    // An essay payload on an MCQ question, and options on an essay question.
    await draft(attemptId, {
      questionId: mcq.id,
      essayAnswer: { text: 'x' },
    }).expect(400);
    await draft(attemptId, {
      questionId: essay.id,
      selectedOptionIds: [mcq.options[0]!.id],
    }).expect(400);
    await draft(attemptId, {
      questionId: essay.id,
      essayAnswer: { attachments: [attachment, attachment, attachment] },
    }).expect(400);

    await t
      .http()
      .post(`/quiz-attempts/${attemptId}/submit`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({})
      .expect(200);
    await draft(attemptId, {
      questionId: essay.id,
      essayAnswer: { text: 'late' },
    }).expect(409);
  });

  describe('attachment upload signature', () => {
    const sign = (attemptId: string, session = student.session) =>
      t
        .http()
        .post(`/quiz-attempts/${attemptId}/attachments/signature`)
        .set('Origin', origin)
        .set('Cookie', session);
    it('signs the attempt folder without exposing the secret', async () => {
      const { attemptId } = await startAttempt();
      const response = await sign(attemptId).expect(200);
      const { signature, timestamp, folder, apiKey, uploadUrl } = response.body;
      expect(folder).toBe(`shanity/quiz-attempts/${attemptId}`);
      expect(apiKey).toBe('key-123');
      expect(uploadUrl).toBe(
        'https://api.cloudinary.com/v1_1/demo-cloud/auto/upload',
      );
      expect(signature).toBe(
        createHash('sha1')
          .update(`folder=${folder}&timestamp=${timestamp}secret-xyz`)
          .digest('hex'),
      );
      expect(JSON.stringify(response.body)).not.toContain('secret-xyz');
    });

    it('refuses other learners and only accepts own-cloud attachment URLs', async () => {
      const { attemptId, essay } = await startAttempt();
      await sign(attemptId, (await t.account()).session).expect(404);
      for (const url of [
        'https://cdn.example.test/scratch.png',
        'https://res.cloudinary.com/other-cloud/image/upload/scratch.png',
      ])
        await draft(attemptId, {
          questionId: essay.id,
          essayAnswer: { attachments: [{ ...attachment, url }] },
        }).expect(400);
      await draft(attemptId, {
        questionId: essay.id,
        essayAnswer: { attachments: [attachment] },
      }).expect(200);
    });
  });
});
