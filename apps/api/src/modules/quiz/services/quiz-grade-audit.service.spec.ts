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

describe('E15 grade adjustment audit trail', () => {
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
    t = await learningApp('quiz-grade-audit');
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

  /** MCQ 10 pts (answered right) + two essays of 10 pts: 30 in total. */
  async function submittedAttempt(passingScore = 82) {
    const [quiz] = await t.db.query(
      `INSERT INTO quizzes(
         title, slug, created_by, scope, target_id, status, published_at,
         passing_score, is_required, shuffle_questions, shuffle_options
       ) VALUES ('Audit', $1, $2, 'LESSON', $3, 'PUBLISHED', now(), $4,
         false, false, false) RETURNING id`,
      [
        `audit-${randomUUID()}`,
        instructorA.id,
        course.lessons[0]!.id,
        passingScore,
      ],
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
    const config = JSON.stringify({
      allowedSubmissionTypes: ['TEXT_WITH_KATEX'],
      maxFileUploads: 1,
    });
    await t.db.query(
      `INSERT INTO quiz_questions(quiz_id, type, content, position, points,
         essay_config)
       VALUES ($1, 'ESSAY', 'Essay 1', 2, 10, $2::jsonb),
              ($1, 'ESSAY', 'Essay 2', 3, 10, $2::jsonb)`,
      [quiz.id, config],
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
            ? { questionId: question.id, essayAnswer: { text: 'Answer' } }
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

  const post = (
    path: string,
    body: object = {},
    session = instructorA.session,
  ) =>
    t.http().post(path).set('Origin', origin).set('Cookie', session).send(body);
  const grade = (
    attemptId: string,
    grades: object[],
    extra: object = {},
    session = instructorA.session,
  ) =>
    post(
      `/instructor/quiz-attempts/${attemptId}/grade`,
      { grades, ...extra },
      session,
    );
  const publish = (attemptId: string) =>
    post(`/instructor/quiz-attempts/${attemptId}/publish`).expect(200);
  const history = (attemptId: string, session = instructorA.session) =>
    t
      .http()
      .get(`/instructor/quiz-attempts/${attemptId}/grade-history`)
      .set('Cookie', session);
  const logs = (attemptId: string) =>
    t.db.query(
      `SELECT old_score::float8 AS "oldScore", new_score::float8 AS "newScore",
         old_feedback AS "oldFeedback", new_feedback AS "newFeedback",
         adjusted_by AS "adjustedBy", adjustment_reason AS "reason",
         was_published AS "wasPublished"
       FROM quiz_grade_audit_logs WHERE attempt_id = $1 ORDER BY created_at, id`,
      [attemptId],
    ) as Promise<Array<Record<string, unknown>>>;
  const attemptRow = (attemptId: string) =>
    t.db
      .query(
        `SELECT status, score, percentage::float8 AS percentage,
           earned_points AS "earnedPoints", is_passed AS "isPassed"
         FROM quiz_attempts WHERE id = $1`,
        [attemptId],
      )
      .then((rows: Array<Record<string, unknown>>) => rows[0]);

  it('records an immutable audit row when an existing grade changes', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 3, feedback: 'Thin' },
      { questionId: essay2, awardedPoints: 7 },
    ]).expect(200);
    // The first grading is not an adjustment.
    expect(await logs(attemptId)).toEqual([]);

    const response = await grade(attemptId, [
      { questionId: essay1, awardedPoints: 4, feedback: 'Better than I read' },
    ]).expect(200);
    expect(response.body).toMatchObject({
      status: 'GRADED',
      adjustedQuestionIds: [essay1],
    });
    expect(await logs(attemptId)).toEqual([
      {
        oldScore: 3,
        newScore: 4,
        oldFeedback: 'Thin',
        newFeedback: 'Better than I read',
        adjustedBy: instructorA.id,
        reason: null,
        wasPublished: false,
      },
    ]);

    // Resending the same grade is a no-op: nothing logged, nothing rewritten.
    const again = await grade(attemptId, [
      { questionId: essay1, awardedPoints: 4, feedback: 'Better than I read' },
    ]).expect(200);
    expect(again.body).toMatchObject({ adjustedQuestionIds: [], result: null });
    expect(await logs(attemptId)).toHaveLength(1);

    // A feedback-only change is an adjustment too.
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 4, feedback: 'Fine' },
    ]).expect(200);
    expect(await logs(attemptId)).toHaveLength(2);

    // The trail itself cannot be altered, not even by the application role.
    await expect(
      t.db.query('UPDATE quiz_grade_audit_logs SET new_score = 10'),
    ).rejects.toThrow(/immutable/);
    await expect(
      t.db.query('DELETE FROM quiz_grade_audit_logs'),
    ).rejects.toThrow(/immutable/);
    await expect(t.db.query('TRUNCATE quiz_grade_audit_logs')).rejects.toThrow(
      /immutable/,
    );
  });

  it('requires a reason to adjust a published attempt', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 3 },
      { questionId: essay2, awardedPoints: 7 },
    ]).expect(200);
    await publish(attemptId);

    for (const extra of [{}, { adjustmentReason: '   ' }]) {
      const refused = await grade(
        attemptId,
        [{ questionId: essay1, awardedPoints: 5 }],
        extra,
      ).expect(400);
      expect(refused.body.message).toBe(
        'A reason must be provided when adjusting scores for published attempts.',
      );
    }
    // Nothing changed, nothing logged.
    expect(await logs(attemptId)).toEqual([]);
    expect(await attemptRow(attemptId)).toMatchObject({ earnedPoints: 20 });

    await grade(attemptId, [{ questionId: essay1, awardedPoints: 5 }], {
      adjustmentReason: ' Missed a correct derivation on page 2 ',
    }).expect(200);
    expect(await logs(attemptId)).toEqual([
      expect.objectContaining({
        oldScore: 3,
        newScore: 5,
        reason: 'Missed a correct derivation on page 2',
        wasPublished: true,
      }),
    ]);
    // The database enforces it as well, whatever the service does.
    await expect(
      t.db.query(
        `INSERT INTO quiz_grade_audit_logs(quiz_answer_id, attempt_id,
           question_id, adjusted_by, old_score, new_score, was_published)
         SELECT id, attempt_id, question_id, $2, 1, 2, true
         FROM attempt_answers WHERE attempt_id = $1 LIMIT 1`,
        [attemptId, instructorA.id],
      ),
    ).rejects.toThrow(/published_reason/);
  });

  it('recalculates the final score and pass status after an adjustment', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt(82);
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 7 },
      { questionId: essay2, awardedPoints: 7 },
    ]).expect(200);
    // 10 + 7 + 7 = 24 of 30 = 80% < 82%.
    expect(await attemptRow(attemptId)).toMatchObject({
      status: 'GRADED',
      earnedPoints: 24,
      score: 80,
      percentage: 80,
      isPassed: false,
    });

    const response = await grade(attemptId, [
      { questionId: essay1, awardedPoints: 8 },
    ]).expect(200);
    // 25 of 30 = 83.33% >= 82%.
    expect(response.body.result).toMatchObject({
      earnedPoints: 25,
      totalPoints: 30,
      percentage: 83.33,
      score: 83,
      isPassed: true,
    });
    expect(await attemptRow(attemptId)).toMatchObject({
      status: 'GRADED',
      earnedPoints: 25,
      score: 83,
      percentage: 83.33,
      isPassed: true,
    });

    // The same holds after publication, and lowering the grade flips it back.
    await publish(attemptId);
    const lowered = await grade(
      attemptId,
      [{ questionId: essay1, awardedPoints: 7 }],
      { adjustmentReason: 'Re-marked against the rubric' },
    ).expect(200);
    expect(lowered.body).toMatchObject({
      status: 'COMPLETED',
      result: { earnedPoints: 24, percentage: 80, isPassed: false },
    });
    expect(await attemptRow(attemptId)).toMatchObject({
      status: 'COMPLETED',
      score: 80,
      isPassed: false,
    });
    expect(
      (await logs(attemptId)).map((l) => [l.oldScore, l.newScore]),
    ).toEqual([
      [7, 8],
      [8, 7],
    ]);
  });

  it('shows the score history timeline to the course instructor only', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 3 },
      { questionId: essay2, awardedPoints: 7 },
    ]).expect(200);
    await grade(attemptId, [{ questionId: essay1, awardedPoints: 4 }]).expect(
      200,
    );
    await publish(attemptId);
    await grade(
      attemptId,
      [{ questionId: essay1, awardedPoints: 6, feedback: 'Second look' }],
      { adjustmentReason: 'Appeal upheld' },
    ).expect(200);

    const response = await history(attemptId).expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toMatchObject({ attemptId, status: 'COMPLETED' });
    const [first, second] = response.body.questions;
    expect(first).toMatchObject({
      questionId: essay1,
      number: 2,
      maxScore: 10,
      currentScore: 6,
      currentFeedback: 'Second look',
    });
    expect(first.adjustments).toHaveLength(2);
    expect(first.adjustments[0]).toMatchObject({
      oldScore: 3,
      newScore: 4,
      wasPublished: false,
      adjustmentReason: null,
      adjustedBy: { id: instructorA.id },
    });
    expect(first.adjustments[1]).toMatchObject({
      oldScore: 4,
      newScore: 6,
      newFeedback: 'Second look',
      wasPublished: true,
      adjustmentReason: 'Appeal upheld',
      adjustedAt: expect.any(String),
    });
    expect(first.adjustments[1].adjustedBy.fullName).toEqual(
      expect.any(String),
    );
    expect(second).toMatchObject({ questionId: essay2, adjustments: [] });

    await history(attemptId, instructorB.session).expect(403);
    await history(attemptId, student.session).expect(403);
    await history(randomUUID()).expect(403);
  });

  it('tells the learner only that, and why, a published grade was adjusted', async () => {
    const { attemptId, essay1, essay2 } = await submittedAttempt();
    await grade(attemptId, [
      { questionId: essay1, awardedPoints: 3 },
      { questionId: essay2, awardedPoints: 7 },
    ]).expect(200);
    // An adjustment before publication is invisible to the learner.
    await grade(attemptId, [{ questionId: essay1, awardedPoints: 4 }]).expect(
      200,
    );
    await publish(attemptId);
    const result = () =>
      t
        .http()
        .get(`/quiz-attempts/${attemptId}/student-result`)
        .set('Cookie', student.session)
        .expect(200);
    expect((await result()).body).not.toHaveProperty('adjustment');

    await grade(attemptId, [{ questionId: essay1, awardedPoints: 6 }], {
      adjustmentReason: 'Appeal upheld',
    }).expect(200);
    const body = (await result()).body;
    expect(body.adjustment).toEqual({
      count: 1,
      lastAdjustedAt: expect.any(String),
      adjustments: [
        { adjustedAt: expect.any(String), reason: 'Appeal upheld' },
      ],
    });
    // The new score is what they see; who/old/new points never leak.
    expect(body.score).toMatchObject({ earnedPoints: 23, totalPoints: 30 });
    const json = JSON.stringify(body.adjustment);
    expect(json).not.toContain(instructorA.id);
    expect(json).not.toContain('oldScore');
  });
});
