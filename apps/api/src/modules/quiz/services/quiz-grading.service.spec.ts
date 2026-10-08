import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../auth/auth.config.js';
import { QuizScoreCalculatorService } from './quiz-score-calculator.service.js';
import {
  learningApp,
  type Account,
} from '../../../../test/support/learning-fixture.js';

type Question = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'ESSAY';
  options: Array<{ id: string }>;
};

describe('E12 manual essay grading and server-side score integrity', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let instructorA: Account;
  let instructorB: Account;
  let student: Account;
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
    t = await learningApp('quiz-grading');
    origin = t.app.get(AuthConfig).origin;
    instructorA = await t.account('instructor');
    instructorB = await t.account('instructor');
    student = await t.account();
    course = await t.course(instructorA, 1, [student]);
  });
  afterAll(async () => {
    for (const [name, value] of Object.entries(saved))
      if (value !== undefined) process.env[name] = value;
    await t?.app.close();
  });

  /**
   * One MCQ (10 pts, answered right) and two essays: Essay 1 is worth 5 with
   * a rubric (3 + 2), Essay 2 is worth 5. Passing score is 80%.
   */
  async function submittedAttempt() {
    const [quiz] = await t.db.query(
      `INSERT INTO quizzes(
         title, slug, created_by, scope, target_id, status, published_at,
         passing_score, is_required, shuffle_questions, shuffle_options
       ) VALUES ('Grading', $1, $2, 'LESSON', $3, 'PUBLISHED', now(), 80,
         false, false, false) RETURNING id`,
      [`grading-${randomUUID()}`, instructorA.id, course.lessons[0]!.id],
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
    const config = {
      allowedSubmissionTypes: ['TEXT_WITH_KATEX'],
      maxFileUploads: 1,
      gradingGuide: 'Award for a correct derivation',
    };
    await t.db.query(
      `INSERT INTO quiz_questions(quiz_id, type, content, position, points,
         essay_config)
       VALUES ($1, 'ESSAY', 'Essay 1', 2, 5, $2::jsonb),
              ($1, 'ESSAY', 'Essay 2', 3, 5, $3::jsonb)`,
      [
        quiz.id,
        JSON.stringify({
          ...config,
          rubric: [
            { criterion: 'Method', maxPoints: 3 },
            { criterion: 'Result', maxPoints: 2 },
          ],
        }),
        JSON.stringify(config),
      ],
    );
    const started = await t
      .http()
      .post(`/quizzes/${quiz.id}/attempts`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .expect(201);
    const questions = started.body.quiz.questions as Question[];
    await t
      .http()
      .post(`/quiz-attempts/${started.body.id}/submit`)
      .set('Origin', origin)
      .set('Cookie', student.session)
      .send({
        answers: questions.map((question) =>
          question.type === 'ESSAY'
            ? {
                questionId: question.id,
                essayAnswer: { text: 'Answer $x^2$' },
              }
            : {
                questionId: question.id,
                selectedOptionIds: [question.options[0]!.id],
              },
        ),
      })
      .expect(200);
    const essays = questions.filter(({ type }) => type === 'ESSAY');
    return {
      attemptId: started.body.id as string,
      essay1: essays[0]!.id,
      essay2: essays[1]!.id,
    };
  }

  const grade = (
    attemptId: string,
    grades: object[],
    session = instructorA.session,
  ) =>
    t
      .http()
      .post(`/instructor/quiz-attempts/${attemptId}/grade`)
      .set('Origin', origin)
      .set('Cookie', session)
      .send({ grades });
  const stored = (attemptId: string, questionId: string) =>
    t.db
      .query(
        `SELECT grading, points_earned AS "pointsEarned"
         FROM attempt_answers WHERE attempt_id = $1 AND question_id = $2`,
        [attemptId, questionId],
      )
      .then((rows: Array<Record<string, unknown>>) => rows[0]);
  const attemptRow = (attemptId: string) =>
    t.db
      .query(
        `SELECT status, score, is_passed AS "isPassed",
           earned_points AS "earnedPoints", percentage::float8 AS percentage
         FROM quiz_attempts WHERE id = $1`,
        [attemptId],
      )
      .then((rows: Array<Record<string, unknown>>) => rows[0]);

  it('saves a valid grade and keeps the attempt open while essays remain', async () => {
    const { attemptId, essay1 } = await submittedAttempt();
    const response = await grade(attemptId, [
      { questionId: essay1, awardedPoints: 4, feedback: ' Good work ' },
    ]).expect(200);
    expect(response.body).toMatchObject({
      status: 'NEEDS_GRADING',
      remainingUngradedCount: 1,
      result: null,
    });
    expect(await stored(attemptId, essay1)).toMatchObject({
      pointsEarned: 4,
      grading: {
        status: 'GRADED',
        awardedPoints: 4,
        feedback: 'Good work',
        gradedBy: instructorA.id,
        gradedAt: expect.any(String),
      },
    });
    expect(await attemptRow(attemptId)).toMatchObject({
      status: 'NEEDS_GRADING',
    });
    // The learner still sees no score.
    const result = await t
      .http()
      .get(`/quiz-attempts/${attemptId}/result`)
      .set('Cookie', student.session)
      .expect(200);
    expect(result.body).toMatchObject({ score: null, scoreVisible: false });
  });

  it('rejects an award above the question maximum, taken from the database', async () => {
    const { attemptId, essay1 } = await submittedAttempt();
    const response = await grade(attemptId, [
      { questionId: essay1, awardedPoints: 10 },
    ]).expect(400);
    expect(response.body.message).toBe(
      'Awarded points (10) exceeds maximum allowed score (5)',
    );
    expect((await stored(attemptId, essay1))!.grading).toMatchObject({
      status: 'UNGRADED',
    });
  });

  it('rejects negative, fractional and malformed awards', async () => {
    const { attemptId, essay1 } = await submittedAttempt();
    await grade(attemptId, [{ questionId: essay1, awardedPoints: -2 }]).expect(
      400,
    );
    await grade(attemptId, [{ questionId: essay1, awardedPoints: 2.5 }]).expect(
      400,
    );
    await grade(attemptId, [{ questionId: essay1 }]).expect(400);
    await grade(attemptId, []).expect(400);
    expect((await stored(attemptId, essay1))!.grading).toMatchObject({
      status: 'UNGRADED',
    });
  });

  it('is all-or-nothing and refuses MCQ or foreign questions', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 3 },
      { questionId: essay2, awardedPoints: 9 },
    ]).expect(400);
    expect((await stored(attemptId, essay1))!.grading).toMatchObject({
      status: 'UNGRADED',
    });
    await grade(attemptId, [
      { questionId: randomUUID(), awardedPoints: 1 },
    ]).expect(400);
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 1 },
      { questionId: essay1, awardedPoints: 2 },
    ]).expect(400);
  });

  it('validates rubric scores against the frozen rubric', async () => {
    const { attemptId, essay1 } = await submittedAttempt();
    const rubric = (scores: Array<[number, number]>, awarded: number) =>
      grade(attemptId, [
        {
          questionId: essay1,
          awardedPoints: awarded,
          rubricScores: scores.map(([criterionIndex, score]) => ({
            criterionIndex,
            score,
          })),
        },
      ]);
    // Method is worth 3, not 4.
    await rubric([[0, 4]], 4).expect(400);
    await rubric([[5, 1]], 1).expect(400);
    // Criteria must add up to the award.
    await rubric(
      [
        [0, 2],
        [1, 1],
      ],
      5,
    ).expect(400);
    await rubric(
      [
        [0, 2],
        [1, 1],
      ],
      3,
    ).expect(200);
  });

  it('grades the attempt with MCQ + essay points when the last essay is graded', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    await grade(attemptId, [{ questionId: essay1, awardedPoints: 4 }]).expect(
      200,
    );
    const last = await grade(attemptId, [
      { questionId: essay2, awardedPoints: 5 },
    ]).expect(200);
    // 10 (MCQ) + 4 + 5 = 19 of 20.
    expect(last.body).toMatchObject({
      status: 'GRADED',
      remainingUngradedCount: 0,
      result: {
        earnedPoints: 19,
        totalPoints: 20,
        percentage: 95,
        score: 95,
        isPassed: true,
      },
    });
    expect(await attemptRow(attemptId)).toMatchObject({
      status: 'GRADED',
      score: 95,
      isPassed: true,
      earnedPoints: 19,
      percentage: 95,
    });

    // Graded is not published: the learner still sees nothing of it.
    const result = await t
      .http()
      .get(`/quiz-attempts/${attemptId}/result`)
      .set('Cookie', student.session)
      .expect(200);
    expect(result.body).toMatchObject({
      status: 'NEEDS_GRADING',
      scoreVisible: false,
      score: null,
      message: 'Submitted. Waiting for instructor to publish results.',
    });
    expect(result.body).not.toHaveProperty('breakdown');

    // Closed attempts cannot be graded again.
    await grade(attemptId, [{ questionId: essay1, awardedPoints: 1 }]).expect(
      409,
    );
  });

  it('fails the attempt below the passing score', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    const response = await grade(attemptId, [
      { questionId: essay1, awardedPoints: 0 },
      { questionId: essay2, awardedPoints: 0 },
    ]).expect(200);
    // 10 of 20 = 50% < 80%.
    expect(response.body.result).toMatchObject({
      score: 50,
      isPassed: false,
    });
  });

  it('only lets the course instructor read and grade the attempt', async () => {
    const { attemptId, essay1 } = await submittedAttempt();
    const body = [{ questionId: essay1, awardedPoints: 1 }];
    await grade(attemptId, body, instructorB.session).expect(403);
    await grade(attemptId, body, student.session).expect(403);
    await grade(randomUUID(), body).expect(403);
    await t
      .http()
      .get(`/instructor/quiz-attempts/${attemptId}`)
      .set('Cookie', instructorB.session)
      .expect(403);
    expect((await stored(attemptId, essay1))!.grading).toMatchObject({
      status: 'UNGRADED',
    });
  });

  it('shows the grader the answers, grading guide and rubric', async () => {
    const { attemptId, essay1 } = await submittedAttempt();
    const response = await t
      .http()
      .get(`/instructor/quiz-attempts/${attemptId}`)
      .set('Cookie', instructorA.session)
      .expect(200);
    expect(response.body).toMatchObject({
      attemptId,
      status: 'NEEDS_GRADING',
      student: { id: student.id, email: student.email },
      course: { id: course.id },
      totalEssays: 2,
      pendingEssaysCount: 2,
    });
    const essay = response.body.questions.find(
      (question: { id: string }) => question.id === essay1,
    );
    expect(essay).toMatchObject({
      points: 5,
      gradingGuide: 'Award for a correct derivation',
      rubric: [
        { criterion: 'Method', maxPoints: 3 },
        { criterion: 'Result', maxPoints: 2 },
      ],
      essayAnswer: { text: 'Answer $x^2$' },
      grading: { status: 'UNGRADED' },
    });
  });

  it('refuses client-computed totals and recomputes everything on the server', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    // Pre-computed fields are rejected outright (global whitelist) ...
    for (const extra of [
      { finalScore: 25 },
      { percentage: 100 },
      { isPassed: true },
    ])
      await t
        .http()
        .post(`/instructor/quiz-attempts/${attemptId}/grade`)
        .set('Origin', origin)
        .set('Cookie', instructorA.session)
        .send({
          grades: [{ questionId: essay1, awardedPoints: 1 }],
          ...extra,
        })
        .expect(400);
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 1, finalScore: 5, isPassed: true },
    ]).expect(400);
    expect((await stored(attemptId, essay1))!.grading).toMatchObject({
      status: 'UNGRADED',
    });

    // ... and what is stored comes only from the database.
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 4 },
      { questionId: essay2, awardedPoints: 3 },
    ]).expect(200);
    // MCQ 10/10 + essays 7/10 = 17/20 = 85%.
    expect(await attemptRow(attemptId)).toMatchObject({
      earnedPoints: 17,
      score: 85,
      percentage: 85,
      isPassed: true,
    });
  });

  it('refuses to finalize while an essay is ungraded, and only once', async () => {
    const calculator = t.app.get(QuizScoreCalculatorService);
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    await grade(attemptId, [{ questionId: essay1, awardedPoints: 4 }]).expect(
      200,
    );
    await expect(
      calculator.calculateAndFinalizeAttempt(attemptId),
    ).rejects.toMatchObject({ status: 422 });
    expect(await attemptRow(attemptId)).toMatchObject({
      status: 'NEEDS_GRADING',
    });

    await grade(attemptId, [{ questionId: essay2, awardedPoints: 5 }]).expect(
      200,
    );
    await expect(
      calculator.calculateAndFinalizeAttempt(attemptId),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      calculator.calculateAndFinalizeAttempt(randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('keeps the breakdown out of the learner view until the result is published', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 4, feedback: 'Good method' },
      { questionId: essay2, awardedPoints: 3 },
    ]).expect(200);
    const result = await t
      .http()
      .get(`/quiz-attempts/${attemptId}/result`)
      .set('Cookie', student.session)
      .expect(200);
    expect(JSON.stringify(result.body)).not.toContain('Good method');
    expect(result.body).not.toHaveProperty('breakdown');
  });
});
