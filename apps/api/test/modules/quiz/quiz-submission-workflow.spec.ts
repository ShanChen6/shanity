import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'ESSAY';
  options: Array<{ id: string }>;
};

describe('Sprint 9 E9-E10 submission pipeline and score concealment', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;
  let origin: string;
  const saved: Record<string, string | undefined> = {};
  const cloudinary = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];

  beforeAll(async () => {
    for (const name of cloudinary) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    t = await learningApp('quiz-submission-workflow');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(async () => {
    for (const [name, value] of Object.entries(saved))
      if (value !== undefined) process.env[name] = value;
    await t?.app.close();
  });

  async function startAttempt(essays: number) {
    const [quiz] = await t.db.query(
      `INSERT INTO quizzes(
         title, slug, created_by, scope, target_id, status, published_at,
         passing_score, is_required, shuffle_questions, shuffle_options
       ) VALUES ('Workflow', $1, $2, 'LESSON', $3, 'PUBLISHED', now(), 50,
         false, false, false) RETURNING id`,
      [`workflow-${randomUUID()}`, owner.id, course.lessons[0]!.id],
    );
    for (let index = 0; index < 2; index++) {
      const [question] = await t.db.query(
        `INSERT INTO quiz_questions(quiz_id, type, content, position, points)
         VALUES ($1, 'MULTIPLE_CHOICE', $2, $3, 10) RETURNING id`,
        [quiz.id, `MCQ ${index}`, index + 1],
      );
      await t.db.query(
        `INSERT INTO quiz_options(question_id, content, position, is_correct)
         VALUES ($1, 'Right', 1, true), ($1, 'Wrong', 2, false)`,
        [question.id],
      );
    }
    for (let index = 0; index < essays; index++)
      await t.db.query(
        `INSERT INTO quiz_questions(quiz_id, type, content, position, points,
           essay_config)
         VALUES ($1, 'ESSAY', 'Essay', $2, 10, $3::jsonb)`,
        [
          quiz.id,
          3 + index,
          JSON.stringify({
            allowedSubmissionTypes: ['TEXT_WITH_KATEX'],
            maxFileUploads: 1,
          }),
        ],
      );
    const started = await t
      .http()
      .post(`/quizzes/${quiz.id}/attempts`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .expect(201);
    const questions = started.body.quiz.questions as Question[];
    return {
      attemptId: started.body.id as string,
      answers: questions.map((question) =>
        question.type === 'ESSAY'
          ? { questionId: question.id, essayAnswer: { text: 'My essay' } }
          : {
              questionId: question.id,
              selectedOptionIds: [question.options[0]!.id],
            },
      ),
    };
  }

  const submit = (attemptId: string, answers: object[] = []) =>
    t
      .http()
      .post(`/quiz-attempts/${attemptId}/submit`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({ answers });
  const get = (path: string) =>
    t.http().get(path).set('Cookie', student.session);

  it('Pure MCQ: completes at once and returns the score', async () => {
    const { attemptId, answers } = await startAttempt(0);
    const response = await submit(attemptId, answers).expect(200);
    expect(response.body).toMatchObject({
      status: 'COMPLETED',
      score: 100,
      isPassed: true,
      earnedPoints: 20,
    });
    const body = (await get(`/quiz-attempts/${attemptId}/result`).expect(200))
      .body;
    expect(body).toMatchObject({
      status: 'COMPLETED',
      scoreVisible: true,
      score: { earnedPoints: 20, totalPoints: 20, passed: true },
    });
    expect(body).not.toHaveProperty('message');
  });

  it('Mixed: needs grading and hides every score from the learner', async () => {
    const { attemptId, answers } = await startAttempt(1);
    const submitted = await submit(attemptId, answers).expect(200);
    expect(submitted.body).toMatchObject({
      status: 'NEEDS_GRADING',
      score: null,
      isPassed: null,
      percentage: null,
      earnedPoints: null,
    });

    const result = (await get(`/quiz-attempts/${attemptId}/result`).expect(200))
      .body;
    expect(result).toMatchObject({
      status: 'NEEDS_GRADING',
      scoreVisible: false,
      score: null,
      message:
        'Your submission is pending instructor review for essay questions.',
    });
    const view = (await get(`/quiz-attempts/${attemptId}`).expect(200)).body;
    // The auto-graded MCQ part (20 of 30) must not leak anywhere.
    for (const body of [result, view]) {
      expect(JSON.stringify(body)).not.toMatch(/"percentage":\d/);
      expect(JSON.stringify(body)).not.toMatch(/"earnedPoints":\d/);
      expect(JSON.stringify(body)).not.toContain('"isPassed":true');
    }

    // Stored for the instructor's final grading; essays are UNGRADED.
    const [stored] = await t.db.query(
      `SELECT earned_points, total_points FROM quiz_attempts WHERE id = $1`,
      [attemptId],
    );
    expect(stored).toMatchObject({ earned_points: 20, total_points: 30 });
    const [row] = await t.db.query(
      `SELECT count(*) FILTER (WHERE grading->>'status' = 'UNGRADED')::int AS ungraded
       FROM attempt_answers WHERE attempt_id = $1`,
      [attemptId],
    );
    expect(row.ungraded).toBe(1);
  });

  it('is idempotent and never reopens a submitted attempt', async () => {
    const { attemptId, answers } = await startAttempt(1);
    await submit(attemptId, answers).expect(200);
    const again = await submit(attemptId, answers).expect(200);
    expect(again.body.status).toBe('NEEDS_GRADING');
    await t
      .http()
      .put(`/quiz-attempts/${attemptId}/answers`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({ questionId: answers[0]!.questionId, selectedOptionIds: [] })
      .expect(409);
  });
});
