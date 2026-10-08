import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../auth/auth.config.js';
import {
  learningApp,
  type Account,
} from '../../../../test/support/learning-fixture.js';

type Question = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'ESSAY';
  options: Array<{ id: string }>;
};

describe('E14 result publication and grade visibility', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let instructorA: Account;
  let instructorB: Account;
  let students: Account[];
  let course: Awaited<ReturnType<typeof t.course>>;
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
    t = await learningApp('quiz-publish');
    origin = t.app.get(AuthConfig).origin;
    instructorA = await t.account('instructor');
    instructorB = await t.account('instructor');
    students = [await t.account(), await t.account(), await t.account()];
    course = await t.course(instructorA, 1, students);
  });
  afterAll(async () => {
    for (const [name, value] of Object.entries(saved))
      if (value !== undefined) process.env[name] = value;
    await t?.app.close();
  });

  /** MCQ 10 pts (right answer 'Right', explained) + one essay of 10 pts. */
  async function quiz(reviewPolicy = 'AFTER_SUBMIT') {
    const [row] = await t.db.query(
      `INSERT INTO quizzes(
         title, slug, created_by, scope, target_id, status, published_at,
         passing_score, is_required, shuffle_questions, shuffle_options,
         review_policy, max_attempts
       ) VALUES ('Publish', $1, $2, 'LESSON', $3, 'PUBLISHED', now(), 60,
         false, false, false, $4, 5) RETURNING id`,
      [
        `publish-${randomUUID()}`,
        instructorA.id,
        course.lessons[0]!.id,
        reviewPolicy,
      ],
    );
    const [mcq] = await t.db.query(
      `INSERT INTO quiz_questions(quiz_id, type, content, position, points,
         explanation)
       VALUES ($1, 'MULTIPLE_CHOICE', 'MCQ', 1, 10, 'Because it is right')
       RETURNING id`,
      [row.id],
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
        row.id,
        JSON.stringify({
          allowedSubmissionTypes: ['TEXT_WITH_KATEX'],
          maxFileUploads: 1,
        }),
      ],
    );
    return row.id as string;
  }

  /** The student submits; `rightMcq` picks the right or the wrong option. */
  async function submit(student: Account, quizId: string, rightMcq = true) {
    const started = await t
      .http()
      .post(`/quizzes/${quizId}/attempts`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .expect(201);
    const questions = started.body.quiz.questions as Question[];
    const mcq = questions.find(({ type }) => type !== 'ESSAY')!;
    const essay = questions.find(({ type }) => type === 'ESSAY')!;
    // Options are in the frozen order: the right one was inserted first.
    await t
      .http()
      .post(`/quiz-attempts/${started.body.id}/submit`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({
        answers: [
          {
            questionId: mcq.id,
            selectedOptionIds: [mcq.options[rightMcq ? 0 : 1]!.id],
          },
          { questionId: essay.id, essayAnswer: { text: 'My essay' } },
        ],
      })
      .expect(200);
    return { attemptId: started.body.id as string, essayId: essay.id };
  }

  const grade = (
    attemptId: string,
    essayId: string,
    awardedPoints: number,
    feedback = 'Clear reasoning',
  ) =>
    t
      .http()
      .post(`/instructor/quiz-attempts/${attemptId}/grade`)
      .set('Origin', origin)
      .set('Cookie', instructorA.session)
      .send({ grades: [{ questionId: essayId, awardedPoints, feedback }] })
      .expect(200);
  const publishOne = (attemptId: string, session = instructorA.session) =>
    t
      .http()
      .post(`/instructor/quiz-attempts/${attemptId}/publish`)
      .set('Origin', origin)
      .set('Cookie', session);
  const publishAll = (quizId: string, session = instructorA.session) =>
    t
      .http()
      .post(`/instructor/quizzes/${quizId}/publish-results`)
      .set('Origin', origin)
      .set('Cookie', session);
  const studentResult = (attemptId: string, student: Account) =>
    t
      .http()
      .get(`/quiz-attempts/${attemptId}/student-result`)
      .set('Cookie', student.session)
      .expect(200);
  const row = (attemptId: string) =>
    t.db
      .query(
        `SELECT status, published_at AS "publishedAt", is_passed AS "isPassed"
         FROM quiz_attempts WHERE id = $1`,
        [attemptId],
      )
      .then((rows: Array<Record<string, unknown>>) => rows[0]);

  it('keeps a graded attempt private: no score, feedback or answer key', async () => {
    const quizId = await quiz();
    const [student] = students;
    const { attemptId, essayId } = await submit(student!, quizId);
    await grade(attemptId, essayId, 8);
    expect(await row(attemptId)).toMatchObject({
      status: 'GRADED',
      publishedAt: null,
    });

    const result = (await studentResult(attemptId, student!)).body;
    expect(result).toMatchObject({
      status: 'NEEDS_GRADING',
      scoreVisible: false,
      score: null,
      message: 'Submitted. Waiting for instructor to publish results.',
    });
    // Nothing of the grade, the key or the explanation leaks anywhere.
    const json = JSON.stringify(result);
    for (const leak of [
      'Clear reasoning',
      'Because it is right',
      '"isCorrect":true',
      '"percentage":',
      '"passed":',
      '"breakdown"',
    ])
      expect(json).not.toContain(leak);
    const view = await t
      .http()
      .get(`/quiz-attempts/${attemptId}`)
      .set('Cookie', student!.session)
      .expect(200);
    expect(view.body).toMatchObject({
      status: 'NEEDS_GRADING',
      score: null,
      isPassed: null,
      percentage: null,
    });
  });

  it('publishes a single attempt and then shows the full result', async () => {
    const quizId = await quiz();
    const [student] = students;
    const { attemptId, essayId } = await submit(student!, quizId);
    // Not graded yet: nothing to publish.
    await publishOne(attemptId).expect(409);
    await grade(attemptId, essayId, 8);

    // Other instructors, learners and unknown ids are refused.
    await publishOne(attemptId, instructorB.session).expect(403);
    await publishOne(attemptId, student!.session).expect(403);
    await publishOne(randomUUID()).expect(403);
    expect(await row(attemptId)).toMatchObject({ status: 'GRADED' });

    const published = await publishOne(attemptId).expect(200);
    expect(published.body).toMatchObject({
      attemptId,
      status: 'COMPLETED',
      alreadyPublished: false,
      publishedAt: expect.any(String),
    });
    expect(await row(attemptId)).toMatchObject({
      status: 'COMPLETED',
      publishedAt: expect.any(Date),
    });
    // Idempotent.
    expect((await publishOne(attemptId).expect(200)).body).toMatchObject({
      alreadyPublished: true,
    });

    // 10 (MCQ) + 8 = 18 of 20 = 90%.
    const result = (await studentResult(attemptId, student!)).body;
    expect(result).toMatchObject({
      status: 'COMPLETED',
      scoreVisible: true,
      score: {
        earnedPoints: 18,
        totalPoints: 20,
        percentage: 90,
        passed: true,
      },
      breakdown: {
        mcq: { score: 10, maxScore: 10 },
        total: { score: 18, maxScore: 20 },
        percentage: 90,
        isPassed: true,
      },
    });
    expect(result.breakdown.essay.questions[0]).toMatchObject({
      awardedPoints: 8,
      feedback: 'Clear reasoning',
    });
    // AFTER_SUBMIT: the answer key and explanation come with it.
    expect(result.reviewAllowed).toBe(true);
    expect(result.questions[0].explanation).toBe('Because it is right');
    expect(
      result.questions[0].options.map(
        (o: { isCorrect?: boolean }) => o.isCorrect,
      ),
    ).toEqual([true, false]);
  });

  it('publishes a whole quiz at once and leaves ungraded attempts alone', async () => {
    const quizId = await quiz();
    const [a, b, c] = students;
    const first = await submit(a!, quizId);
    const second = await submit(b!, quizId);
    const third = await submit(c!, quizId);
    await grade(first.attemptId, first.essayId, 5);
    await grade(second.attemptId, second.essayId, 10);
    // `third` is still waiting for the instructor.

    await publishAll(quizId, instructorB.session).expect(403);
    await publishAll(quizId, a!.session).expect(403);
    await publishAll(randomUUID()).expect(403);
    expect(await row(first.attemptId)).toMatchObject({ status: 'GRADED' });

    const response = await publishAll(quizId).expect(200);
    expect(response.body).toMatchObject({
      quizId,
      publishedCount: 2,
      stillNeedGradingCount: 1,
    });
    const byId = (a: string, b: string) => a.localeCompare(b);
    expect([...(response.body.attemptIds as string[])].sort(byId)).toEqual(
      [first.attemptId, second.attemptId].sort(byId),
    );
    for (const { attemptId } of [first, second])
      expect(await row(attemptId)).toMatchObject({
        status: 'COMPLETED',
        publishedAt: expect.any(Date),
      });
    expect(await row(third.attemptId)).toMatchObject({
      status: 'NEEDS_GRADING',
      publishedAt: null,
    });
    // A second run has nothing left to publish.
    expect((await publishAll(quizId).expect(200)).body.publishedCount).toBe(0);
    // The waiting learner still sees nothing.
    expect((await studentResult(third.attemptId, c!)).body).toMatchObject({
      score: null,
    });
  });

  it('still applies the quiz review policy to a published result', async () => {
    // AFTER_PASS: a failing learner gets the score and feedback, not the key.
    const quizId = await quiz('AFTER_PASS');
    const [student] = students;
    const { attemptId, essayId } = await submit(student!, quizId, false);
    await grade(attemptId, essayId, 2);
    await publishOne(attemptId).expect(200);

    const result = (await studentResult(attemptId, student!)).body;
    // 0 + 2 of 20 = 10% < 60%.
    expect(result).toMatchObject({
      status: 'COMPLETED',
      score: { percentage: 10, passed: false },
      reviewAllowed: false,
    });
    expect(result.breakdown.essay.questions[0].feedback).toBe(
      'Clear reasoning',
    );
    const question = result.questions[0];
    expect(question.explanation).toBeNull();
    for (const option of question.options)
      expect(option).not.toHaveProperty('isCorrect');
    expect(JSON.stringify(result)).not.toContain('Because it is right');

    // NEVER hides the key even from a learner who passed.
    const never = await quiz('NEVER');
    const passed = await submit(students[1]!, never);
    await grade(passed.attemptId, passed.essayId, 10);
    await publishOne(passed.attemptId).expect(200);
    const hidden = (await studentResult(passed.attemptId, students[1]!)).body;
    expect(hidden).toMatchObject({
      score: { passed: true },
      reviewAllowed: false,
    });
    expect(JSON.stringify(hidden)).not.toContain('Because it is right');
  });
});
