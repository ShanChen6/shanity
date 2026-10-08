import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Account } from '../support/learning-fixture.js';
import { quizEngine } from './quiz-e2e-support.js';

/*
 * Sprint 9 final audit (E17): 15 acceptance scenarios for the essay and mixed
 * assessment engine, driven through the real HTTP API against a real
 * PostgreSQL database. Every security rule is asserted at the API/service
 * level (status codes and database state), never through the UI.
 *
 * Status naming used by this codebase (E1/E13/E14): a finished essay attempt
 * is GRADED while the result is private, and COMPLETED once it is published
 * (`published_at` set). The audit's "COMPLETED (GRADED)" and "PUBLISHED" map
 * to these two states.
 */

type Question = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'SINGLE_CHOICE' | 'ESSAY';
  options: Array<{ id: string }>;
};
type Engine = Awaited<ReturnType<typeof quizEngine>>;

const FEEDBACK = 'AUDIT-FEEDBACK-visible-only-after-publish';
const EXPLANATION = 'AUDIT-EXPLANATION-answer-key';
const ATTACHMENTS = [
  {
    url: 'https://res.cloudinary.com/audit/image/upload/scratch-1.png',
    filename: 'scratch-1.png',
    mimeType: 'image/png',
    size: 2048,
  },
  {
    url: 'https://res.cloudinary.com/audit/image/upload/scratch-2.jpg',
    filename: 'scratch-2.jpg',
    mimeType: 'image/jpeg',
    size: 4096,
  },
];

describe('Sprint 9 final audit: essay & mixed assessment engine', () => {
  let e: Engine;
  let instructorA: Account;
  let instructorB: Account;
  let student: Account;
  let courseA: Awaited<ReturnType<Engine['course']>>;
  const saved: Record<string, string | undefined> = {};
  const cloudinary = [
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ];

  beforeAll(async () => {
    // Attachment hosts are only enforced when Cloudinary is configured.
    for (const name of cloudinary) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
    e = await quizEngine('sprint9-final-audit');
    instructorA = await e.account('instructor');
    instructorB = await e.account('instructor');
    student = await e.account();
    courseA = await e.course(instructorA, 1, [student]);
    // Instructor B teaches a different course: no relation to Course A.
    await e.course(instructorB, 1);
  });
  afterAll(async () => {
    for (const [name, value] of Object.entries(saved))
      if (value !== undefined) process.env[name] = value;
    await e?.app.close();
  });

  // ---- fixtures: everything is created through the public API ----

  /**
   * A published LESSON quiz of Course A. Questions in order: `mcq` MCQs worth
   * 10 each (first option is the right one), then one essay per entry of
   * `essays`, worth that many points. Shuffling is off.
   */
  async function quiz(
    spec: {
      mcq?: number;
      essays?: number[];
      reviewPolicy?: string;
      passingScore?: number;
    } = {},
  ) {
    const { mcq = 0, essays = [], reviewPolicy = 'AFTER_SUBMIT' } = spec;
    const call = e.as(instructorA);
    const created = await call('post', '/admin/quizzes', {
      title: 'Sprint 9 audit',
      scope: 'LESSON',
      targetId: courseA.lessons[0]!.id,
      passingScore: spec.passingScore ?? 60,
      reviewPolicy,
      ...(reviewPolicy !== 'AFTER_SUBMIT' && { maxAttempts: 5 }),
      shuffleQuestions: false,
      shuffleOptions: false,
    }).expect(201);
    const id = created.body.id as string;
    for (let index = 0; index < mcq; index++)
      await call('post', `/admin/quizzes/${id}/questions`, {
        content: `MCQ ${index + 1}`,
        points: 10,
        explanation: EXPLANATION,
        options: [{ content: 'Right', isCorrect: true }, { content: 'Wrong' }],
      }).expect(201);
    for (const [index, points] of essays.entries())
      await call('post', `/admin/quizzes/${id}/questions`, {
        type: 'ESSAY',
        content: `Essay ${index + 1} $x^2$`,
        points,
        essayConfig: {
          allowedSubmissionTypes: ['TEXT_WITH_KATEX', 'FILE_UPLOAD'],
          maxFileUploads: 3,
          gradingGuide: 'Award for a correct derivation',
        },
      }).expect(201);
    await call('post', `/admin/quizzes/${id}/publish`).expect(200);
    return id;
  }

  async function start(who: Account, quizId: string) {
    const response = await e
      .as(who)('post', `/quizzes/${quizId}/attempts`)
      .expect(201);
    const questions = response.body.quiz.questions as Question[];
    return {
      attemptId: response.body.id as string,
      mcqs: questions.filter(({ type }) => type !== 'ESSAY'),
      essays: questions.filter(({ type }) => type === 'ESSAY'),
    };
  }

  const submit = (who: Account, attemptId: string, answers?: object[]) =>
    e.as(who)('post', `/quiz-attempts/${attemptId}/submit`, { answers });

  /** Starts and submits: every MCQ right (or wrong), every essay answered. */
  async function submitted(
    quizId: string,
    options: { mcqRight?: boolean; who?: Account } = {},
  ) {
    const who = options.who ?? student;
    const attempt = await start(who, quizId);
    const response = await submit(who, attempt.attemptId, [
      ...attempt.mcqs.map((question) => ({
        questionId: question.id,
        selectedOptionIds: [
          question.options[options.mcqRight === false ? 1 : 0]!.id,
        ],
      })),
      ...attempt.essays.map((question) => ({
        questionId: question.id,
        essayAnswer: { text: 'My derivation $x^2$' },
      })),
    ]).expect(200);
    return { ...attempt, response };
  }

  const grade = (
    attemptId: string,
    grades: object[],
    who = instructorA,
    extra: object = {},
  ) =>
    e.as(who)('post', `/instructor/quiz-attempts/${attemptId}/grade`, {
      grades,
      ...extra,
    });
  const award = (questionId: string, awardedPoints: number) => ({
    questionId,
    awardedPoints,
    feedback: FEEDBACK,
  });
  const publish = (attemptId: string, who = instructorA) =>
    e.as(who)('post', `/instructor/quiz-attempts/${attemptId}/publish`);
  const learnerResult = (attemptId: string, who = student) =>
    e.as(who)('get', `/quiz-attempts/${attemptId}/student-result`);
  const attemptRow = async (attemptId: string) =>
    (
      (await e.db.query(
        `SELECT status, score, is_passed AS "isPassed",
           earned_points AS "earnedPoints", total_points AS "totalPoints",
           percentage::float8 AS percentage, published_at AS "publishedAt",
           submitted_at AS "submittedAt"
         FROM quiz_attempts WHERE id = $1`,
        [attemptId],
      )) as Array<Record<string, unknown>>
    )[0]!;
  const answerRows = (attemptId: string) =>
    e.db.query(
      `SELECT question_id AS "questionId", is_correct AS "isCorrect",
         points_earned AS "pointsEarned", essay_answer AS "essayAnswer",
         grading, selected_option_ids AS "selectedOptionIds"
       FROM attempt_answers WHERE attempt_id = $1 ORDER BY saved_at, id`,
      [attemptId],
    ) as Promise<Array<Record<string, unknown>>>;

  // ======================================================================
  // 1. Submission pipeline & state machine
  // ======================================================================

  it('T01 pure MCQ: auto-graded, finalized and visible at once', async () => {
    const quizId = await quiz({ mcq: 2 });
    const { attemptId, response } = await submitted(quizId);
    expect(response.body).toMatchObject({
      status: 'COMPLETED',
      score: 100,
      isPassed: true,
      earnedPoints: 20,
      totalPoints: 20,
    });
    expect(await attemptRow(attemptId)).toMatchObject({
      status: 'COMPLETED',
      score: 100,
      isPassed: true,
      publishedAt: expect.any(Date),
    });
    const result = (await learnerResult(attemptId).expect(200)).body;
    expect(result).toMatchObject({
      status: 'COMPLETED',
      scoreVisible: true,
      score: { earnedPoints: 20, totalPoints: 20, passed: true },
    });
  });

  it('T02 pure essay: NEEDS_GRADING with no score', async () => {
    const quizId = await quiz({ essays: [10, 10] });
    const { attemptId, response } = await submitted(quizId);
    expect(response.body).toMatchObject({
      status: 'NEEDS_GRADING',
      score: null,
      isPassed: null,
      percentage: null,
    });
    const result = (await learnerResult(attemptId).expect(200)).body;
    expect(result).toMatchObject({
      status: 'NEEDS_GRADING',
      scoreVisible: false,
      score: null,
    });
    // Every essay is waiting for the instructor.
    const rows = await answerRows(attemptId);
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(row.grading).toMatchObject({ status: 'UNGRADED' });
    expect((await attemptRow(attemptId)).status).toBe('NEEDS_GRADING');
  });

  it('T03 mixed quiz: MCQ scored provisionally, attempt still NEEDS_GRADING', async () => {
    const quizId = await quiz({ mcq: 2, essays: [10] });
    const { attemptId, response } = await submitted(quizId);
    expect(response.body).toMatchObject({
      status: 'NEEDS_GRADING',
      score: null,
      isPassed: null,
      earnedPoints: null,
    });
    // Stored internally (instructor-side), concealed from the learner.
    expect(await attemptRow(attemptId)).toMatchObject({
      status: 'NEEDS_GRADING',
      earnedPoints: 20,
      totalPoints: 30,
    });
    const rows = await answerRows(attemptId);
    const mcq = rows.filter((row) => row.grading === null);
    expect(mcq).toHaveLength(2);
    for (const row of mcq)
      expect(row).toMatchObject({ isCorrect: true, pointsEarned: 10 });
    expect(JSON.stringify((await learnerResult(attemptId)).body)).not.toMatch(
      /"earnedPoints":\d/,
    );
  });

  it('T04 partial grading: 2 of 3 essays graded keeps NEEDS_GRADING', async () => {
    const quizId = await quiz({ essays: [5, 5, 5] });
    const attempt = await submitted(quizId);
    const [first, second] = attempt.essays;
    const response = await grade(attempt.attemptId, [
      award(first!.id, 4),
      award(second!.id, 3),
    ]).expect(200);
    expect(response.body).toMatchObject({
      status: 'NEEDS_GRADING',
      remainingUngradedCount: 1,
      result: null,
    });
    expect(await attemptRow(attempt.attemptId)).toMatchObject({
      status: 'NEEDS_GRADING',
      publishedAt: null,
    });
    // Still no score for the learner.
    expect((await learnerResult(attempt.attemptId)).body).toMatchObject({
      score: null,
    });
  });

  it('T05 last essay graded: the attempt becomes GRADED with its final score', async () => {
    const quizId = await quiz({ mcq: 1, essays: [10, 10] });
    const attempt = await submitted(quizId);
    const [first, second] = attempt.essays;
    await grade(attempt.attemptId, [award(first!.id, 7)]).expect(200);
    const last = await grade(attempt.attemptId, [award(second!.id, 8)]).expect(
      200,
    );
    // 10 (MCQ) + 7 + 8 = 25 of 30.
    expect(last.body).toMatchObject({
      status: 'GRADED',
      remainingUngradedCount: 0,
      result: { earnedPoints: 25, totalPoints: 30, isPassed: true },
    });
    expect(await attemptRow(attempt.attemptId)).toMatchObject({
      status: 'GRADED',
      earnedPoints: 25,
      score: 83,
      percentage: 83.33,
      isPassed: true,
      // Graded is not published.
      publishedAt: null,
    });
  });

  // ======================================================================
  // 2. Persistence & resume
  // ======================================================================

  it('T06 essay autosave stores text and attachments, one row per question', async () => {
    const quizId = await quiz({ mcq: 1, essays: [10] });
    const attempt = await start(student, quizId);
    const essay = attempt.essays[0]!;
    const save = (essayAnswer: object) =>
      e
        .as(student)(
          'patch',
          `/quiz-attempts/${attempt.attemptId}/answers/draft`,
          { questionId: essay.id, essayAnswer },
        )
        .expect(200);

    // A debounced burst of saves, each one a newer snapshot of the editor.
    await save({ text: 'The' });
    await save({ text: 'The proof $x^2$' });
    await save({ text: 'The proof $x^2$ is simple', attachments: ATTACHMENTS });
    await e
      .as(student)(
        'patch',
        `/quiz-attempts/${attempt.attemptId}/answers/draft`,
        {
          questionId: attempt.mcqs[0]!.id,
          selectedOptionIds: [attempt.mcqs[0]!.options[0]!.id],
        },
      )
      .expect(200);

    const rows = await answerRows(attempt.attemptId);
    const essayRows = rows.filter((row) => row.questionId === essay.id);
    expect(essayRows).toHaveLength(1);
    expect(essayRows[0]!.essayAnswer).toEqual({
      text: 'The proof $x^2$ is simple',
      attachments: ATTACHMENTS,
    });
    expect(rows).toHaveLength(2);
    // Drafting never grades or closes anything.
    expect(await attemptRow(attempt.attemptId)).toMatchObject({
      status: 'IN_PROGRESS',
      score: null,
    });
  });

  it('T07 reload and a second device restore the whole draft', async () => {
    const quizId = await quiz({ mcq: 1, essays: [10] });
    const attempt = await start(student, quizId);
    const essay = attempt.essays[0]!;
    const mcq = attempt.mcqs[0]!;
    const draft = { text: 'Half-finished $a+b$', attachments: ATTACHMENTS };
    await e
      .as(student)(
        'patch',
        `/quiz-attempts/${attempt.attemptId}/answers/draft`,
        { questionId: essay.id, essayAnswer: draft },
      )
      .expect(200);
    await e
      .as(student)(
        'patch',
        `/quiz-attempts/${attempt.attemptId}/answers/draft`,
        { questionId: mcq.id, selectedOptionIds: [mcq.options[1]!.id] },
      )
      .expect(200);

    // F5 / connection lost and back / another browser: a fresh session.
    const device2: Account = {
      ...student,
      session: await e.login(student.email),
    };
    const answersOf = (body: { answers: Array<{ questionId: string }> }) =>
      new Map(body.answers.map((answer) => [answer.questionId, answer]));
    const viaActive = (
      await e
        .as(device2)('get', `/quizzes/${quizId}/active-attempt`)
        .expect(200)
    ).body;
    const viaId = (
      await e
        .as(device2)('get', `/quiz-attempts/${attempt.attemptId}`)
        .expect(200)
    ).body;
    for (const body of [viaActive, viaId]) {
      expect(body).toMatchObject({
        id: attempt.attemptId,
        status: 'IN_PROGRESS',
      });
      const answers = answersOf(body);
      expect(answers.get(essay.id)).toMatchObject({ essayAnswer: draft });
      expect(answers.get(mcq.id)).toMatchObject({
        selectedOptionIds: [mcq.options[1]!.id],
      });
    }

    // Submitting without resending anything grades what was restored.
    await submit(device2, attempt.attemptId, []).expect(200);
    const stored = (await answerRows(attempt.attemptId)).find(
      (row) => row.questionId === essay.id,
    );
    expect(stored!.essayAnswer).toEqual(draft);
  });

  // ======================================================================
  // 3. Security, RBAC & tenancy
  // ======================================================================

  it('T08 the course instructor can grade (200)', async () => {
    const quizId = await quiz({ essays: [5] });
    const attempt = await submitted(quizId);
    const response = await grade(attempt.attemptId, [
      award(attempt.essays[0]!.id, 4),
    ]).expect(200);
    expect(response.body).toMatchObject({
      status: 'GRADED',
      gradedQuestionIds: [attempt.essays[0]!.id],
    });
    expect((await answerRows(attempt.attemptId))[0]!.grading).toMatchObject({
      status: 'GRADED',
      awardedPoints: 4,
      gradedBy: instructorA.id,
    });
  });

  it("T09 another course's instructor is denied (403) on every grading route", async () => {
    const quizId = await quiz({ essays: [5] });
    const attempt = await submitted(quizId);
    const essay = attempt.essays[0]!;
    const base = `/instructor/quiz-attempts/${attempt.attemptId}`;
    const b = e.as(instructorB);
    await b('post', `${base}/grade`, { grades: [award(essay.id, 4)] }).expect(
      403,
    );
    await b('get', base).expect(403);
    await b('get', `${base}/grade-history`).expect(403);
    await b('post', `${base}/publish`).expect(403);
    await b('post', `/instructor/quizzes/${quizId}/publish-results`).expect(
      403,
    );
    await b('get', `/instructor/grading-queue?courseId=${courseA.id}`).expect(
      403,
    );
    // Nothing changed.
    expect((await answerRows(attempt.attemptId))[0]!.grading).toMatchObject({
      status: 'UNGRADED',
    });
    expect((await attemptRow(attempt.attemptId)).status).toBe('NEEDS_GRADING');
    // The queue never leaks it either.
    const queue = await b('get', '/instructor/grading-queue').expect(200);
    expect(JSON.stringify(queue.body)).not.toContain(attempt.attemptId);
  });

  it('T10 a student cannot grade or adjust scores (403), nor forge them', async () => {
    const quizId = await quiz({ essays: [5] });
    const attempt = await submitted(quizId);
    const essay = attempt.essays[0]!;
    const base = `/instructor/quiz-attempts/${attempt.attemptId}`;
    const s = e.as(student);
    await s('post', `${base}/grade`, { grades: [award(essay.id, 5)] }).expect(
      403,
    );
    await s('post', `${base}/publish`).expect(403);
    await s('get', `${base}/grade-history`).expect(403);
    await s('get', '/instructor/grading-queue').expect(403);
    await e
      .http()
      .post(`${base}/grade`)
      .set('Origin', e.origin)
      .send({ grades: [] })
      .expect(401);

    // Pre-computed scores in the learner's own requests change nothing.
    const again = await submit(student, attempt.attemptId, []).expect(200);
    expect(again.body).toMatchObject({ status: 'NEEDS_GRADING', score: null });
    await e
      .as(student)('post', `/quiz-attempts/${attempt.attemptId}/submit`, {
        score: 100,
        isPassed: true,
        earnedPoints: 5,
        totalPoints: 5,
        percentage: 100,
      })
      .expect(200);
    // The answer is closed: no drafts or answer edits after submission.
    await s('patch', `/quiz-attempts/${attempt.attemptId}/answers/draft`, {
      questionId: essay.id,
      essayAnswer: { text: 'rewritten after submit' },
    }).expect(409);
    expect((await answerRows(attempt.attemptId))[0]).toMatchObject({
      grading: { status: 'UNGRADED' },
      essayAnswer: { text: 'My derivation $x^2$' },
    });
    expect(await attemptRow(attempt.attemptId)).toMatchObject({
      status: 'NEEDS_GRADING',
    });
  });

  // ======================================================================
  // 4. Boundary & score integrity
  // ======================================================================

  it('T11 scores above the maximum or below zero are rejected (400)', async () => {
    const quizId = await quiz({ essays: [5] });
    const attempt = await submitted(quizId);
    const essay = attempt.essays[0]!;
    const over = await grade(attempt.attemptId, [award(essay.id, 6)]).expect(
      400,
    );
    expect(over.body.message).toBe(
      'Awarded points (6) exceeds maximum allowed score (5)',
    );
    await grade(attempt.attemptId, [award(essay.id, -1)]).expect(400);
    await grade(attempt.attemptId, [award(essay.id, 2.5)]).expect(400);
    // A batch is all-or-nothing, and the ceiling comes from the server.
    await grade(attempt.attemptId, [
      award(essay.id, 3),
      award(randomUUID(), 1),
    ]).expect(400);
    await grade(attempt.attemptId, [
      { questionId: essay.id, awardedPoints: 3, maxScore: 100 },
    ]).expect(400);
    expect((await answerRows(attempt.attemptId))[0]!.grading).toMatchObject({
      status: 'UNGRADED',
    });
    // The boundary itself is fine.
    await grade(attempt.attemptId, [award(essay.id, 5)]).expect(200);
    await grade(attempt.attemptId, [award(essay.id, 0)]).expect(200);
  });

  // ======================================================================
  // 5. Score concealment & publish lifecycle
  // ======================================================================

  it('T12 a graded but unpublished attempt reveals nothing to the learner', async () => {
    const quizId = await quiz({ mcq: 1, essays: [10] });
    // A learner with no other attempts, so the history list holds only this one.
    const reader = await courseStudent();
    const attempt = await submitted(quizId, { who: reader });
    await grade(attempt.attemptId, [award(attempt.essays[0]!.id, 9)]).expect(
      200,
    );
    expect((await attemptRow(attempt.attemptId)).status).toBe('GRADED');

    const result = (await learnerResult(attempt.attemptId, reader).expect(200))
      .body;
    expect(result).toMatchObject({
      status: 'NEEDS_GRADING',
      scoreVisible: false,
      score: null,
      message: 'Submitted. Waiting for instructor to publish results.',
    });
    // Every learner-facing read: result, attempt, history, quiz progress.
    const reads = [
      result,
      (
        await e
          .as(reader)('get', `/quiz-attempts/${attempt.attemptId}`)
          .expect(200)
      ).body,
      (
        await e
          .as(reader)('get', `/quiz-attempts/${attempt.attemptId}/result`)
          .expect(200)
      ).body,
      (await e.as(reader)('get', '/my-quiz-attempts').expect(200)).body,
    ];
    for (const body of reads) {
      const json = JSON.stringify(body);
      expect(json).not.toContain(FEEDBACK);
      expect(json).not.toContain(EXPLANATION);
      expect(json).not.toContain('"isPassed":true');
      expect(json).not.toContain('"passed":true');
      expect(json).not.toMatch(/"(percentage|earnedPoints|score)":\d/);
      expect(json).not.toContain('"breakdown"');
      expect(json).not.toContain('"isCorrect":true');
      expect(json).not.toContain('"GRADED"');
    }
  });

  it('T13 publishing reveals score, pass/fail, feedback and the key per review policy', async () => {
    const quizId = await quiz({ mcq: 1, essays: [10] });
    const attempt = await submitted(quizId);
    await grade(attempt.attemptId, [award(attempt.essays[0]!.id, 9)]).expect(
      200,
    );
    await publish(attempt.attemptId).expect(200);

    // 10 + 9 of 20 = 95%.
    const result = (await learnerResult(attempt.attemptId).expect(200)).body;
    expect(result).toMatchObject({
      status: 'COMPLETED',
      scoreVisible: true,
      score: {
        earnedPoints: 19,
        totalPoints: 20,
        percentage: 95,
        passed: true,
      },
      breakdown: {
        mcq: { score: 10, maxScore: 10 },
        essay: { score: 9, maxScore: 10 },
        total: { score: 19, maxScore: 20 },
        isPassed: true,
      },
      reviewAllowed: true,
    });
    expect(result.breakdown.essay.questions[0].feedback).toBe(FEEDBACK);
    expect(result.questions[0].explanation).toBe(EXPLANATION);
    expect(
      result.questions[0].options.map(
        (o: { isCorrect?: boolean }) => o.isCorrect,
      ),
    ).toEqual([true, false]);

    // review policy NEVER: score and feedback yes, answer key never.
    const strict = await quiz({ mcq: 1, essays: [10], reviewPolicy: 'NEVER' });
    const hidden = await submitted(strict);
    await grade(hidden.attemptId, [award(hidden.essays[0]!.id, 9)]).expect(200);
    await publish(hidden.attemptId).expect(200);
    const sealed = (await learnerResult(hidden.attemptId).expect(200)).body;
    expect(sealed).toMatchObject({
      status: 'COMPLETED',
      score: { passed: true },
      reviewAllowed: false,
    });
    expect(sealed.breakdown.essay.questions[0].feedback).toBe(FEEDBACK);
    expect(JSON.stringify(sealed)).not.toContain(EXPLANATION);
    for (const option of sealed.questions[0].options)
      expect(option).not.toHaveProperty('isCorrect');
  });

  // ======================================================================
  // 6. Audit trail & versioning
  // ======================================================================

  it('T14 a grade adjustment is logged and the final score is recalculated', async () => {
    // MCQ 10 + essay /10 + essay /10 = /30, pass mark 82%.
    const quizId = await quiz({ mcq: 1, essays: [10, 10], passingScore: 82 });
    const attempt = await submitted(quizId);
    const [first, second] = attempt.essays;
    await grade(attempt.attemptId, [
      award(first!.id, 3),
      award(second!.id, 10),
    ]).expect(200);
    // 10 + 3 + 10 = 23 of 30 = 76.67%: failed.
    expect(await attemptRow(attempt.attemptId)).toMatchObject({
      status: 'GRADED',
      earnedPoints: 23,
      isPassed: false,
    });
    await publish(attempt.attemptId).expect(200);

    // Published: a reason is mandatory.
    const refused = await grade(attempt.attemptId, [
      award(first!.id, 8),
    ]).expect(400);
    expect(refused.body.message).toBe(
      'A reason must be provided when adjusting scores for published attempts.',
    );

    // 3 -> 8: 10 + 8 + 10 = 28 of 30 = 93.33%.
    await grade(attempt.attemptId, [award(first!.id, 8)], instructorA, {
      adjustmentReason: 'Appeal upheld: derivation was correct',
    }).expect(200);
    const [log, ...rest] = (await e.db.query(
      `SELECT old_score::float8 AS "oldScore", new_score::float8 AS "newScore",
         adjusted_by AS "adjustedBy", adjustment_reason AS reason,
         was_published AS "wasPublished"
       FROM quiz_grade_audit_logs WHERE attempt_id = $1`,
      [attempt.attemptId],
    )) as Array<Record<string, unknown>>;
    expect(rest).toEqual([]);
    expect(log).toEqual({
      oldScore: 3,
      newScore: 8,
      adjustedBy: instructorA.id,
      reason: 'Appeal upheld: derivation was correct',
      wasPublished: true,
    });
    expect(await attemptRow(attempt.attemptId)).toMatchObject({
      status: 'COMPLETED',
      earnedPoints: 28,
      score: 93,
      percentage: 93.33,
      isPassed: true,
    });
    // The learner sees the new total, and that it was adjusted.
    expect(
      (await learnerResult(attempt.attemptId).expect(200)).body,
    ).toMatchObject({
      score: { earnedPoints: 28, percentage: 93.33, passed: true },
      adjustment: { count: 1 },
    });
    // The trail is append-only, even for the database owner's application role.
    await expect(
      e.db.query('UPDATE quiz_grade_audit_logs SET new_score = 10'),
    ).rejects.toThrow(/immutable/);
    await expect(
      e.db.query('DELETE FROM quiz_grade_audit_logs'),
    ).rejects.toThrow(/immutable/);
    // History for the instructor, with who and why.
    const history = (
      await e
        .as(instructorA)(
          'get',
          `/instructor/quiz-attempts/${attempt.attemptId}/grade-history`,
        )
        .expect(200)
    ).body;
    expect(history.questions[0].adjustments).toEqual([
      expect.objectContaining({
        oldScore: 3,
        newScore: 8,
        adjustedBy: expect.objectContaining({ id: instructorA.id }),
        adjustmentReason: 'Appeal upheld: derivation was correct',
      }),
    ]);
  });

  it('T15 grading an attempt of an old quiz version uses its own snapshot', async () => {
    // v1: MCQ 10 + essay /5.
    const quizId = await quiz({ mcq: 1, essays: [5] });
    const oldAttempt = await submitted(quizId);
    const essayId = oldAttempt.essays[0]!.id;

    // The instructor now opens v2 and raises the essay to /20.
    const call = e.as(instructorA);
    const opened = await call(
      'post',
      `/admin/quizzes/${quizId}/versions`,
    ).expect(201);
    expect(opened.body).toMatchObject({ version: 2, status: 'DRAFT' });
    const current = (await call('get', `/admin/quizzes/${quizId}`).expect(200))
      .body;
    const essayV2 = current.questions.find(
      (question: { type: string }) => question.type === 'ESSAY',
    );
    await call('put', `/admin/quizzes/${quizId}/questions/${essayV2.id}`, {
      content: 'Essay 1 v2: harder, worth more',
      points: 20,
      essayConfig: {
        allowedSubmissionTypes: ['TEXT_WITH_KATEX', 'FILE_UPLOAD'],
        maxFileUploads: 3,
        gradingGuide: 'v2 guide',
      },
    }).expect(200);
    await call('post', `/admin/quizzes/${quizId}/publish`).expect(200);

    // The old attempt is still graded on a 5-point scale, not the new 20.
    const [{ quizVersion }] = await e.db.query(
      'SELECT quiz_version AS "quizVersion" FROM quiz_attempts WHERE id = $1',
      [oldAttempt.attemptId],
    );
    expect(quizVersion).toBe(1);
    const tooMuch = await grade(oldAttempt.attemptId, [
      award(essayId, 15),
    ]).expect(400);
    expect(tooMuch.body.message).toBe(
      'Awarded points (15) exceeds maximum allowed score (5)',
    );
    await grade(oldAttempt.attemptId, [award(essayId, 5)]).expect(200);
    // 10 + 5 of 15, not of 30.
    expect(await attemptRow(oldAttempt.attemptId)).toMatchObject({
      status: 'GRADED',
      earnedPoints: 15,
      totalPoints: 15,
      percentage: 100,
      isPassed: true,
    });
    const detail = (
      await e
        .as(instructorA)(
          'get',
          `/instructor/quiz-attempts/${oldAttempt.attemptId}`,
        )
        .expect(200)
    ).body;
    const shown = detail.questions.find(
      (q: { type: string }) => q.type === 'ESSAY',
    );
    expect(shown).toMatchObject({
      points: 5,
      gradingGuide: 'Award for a correct derivation',
    });
    expect(shown.content).not.toContain('v2');

    // A fresh attempt of v2 is graded on the new scale: both coexist.
    const fresh = await submitted(quizId, { who: await courseStudent() });
    await grade(fresh.attemptId, [award(fresh.essays[0]!.id, 15)]).expect(200);
    expect(await attemptRow(fresh.attemptId)).toMatchObject({
      totalPoints: 30,
      earnedPoints: 25,
    });
  });

  // ======================================================================
  // Supplement: the state machine itself, enforced by the database
  // ======================================================================

  it('S1 no transition outside IN_PROGRESS → NEEDS_GRADING → GRADED → COMPLETED is possible', async () => {
    const quizId = await quiz({ essays: [5] });
    const attempt = await submitted(quizId);
    const setStatus = (status: string) =>
      e.db.query('UPDATE quiz_attempts SET status = $2 WHERE id = $1', [
        attempt.attemptId,
        status,
      ]);

    // NEEDS_GRADING cannot jump to COMPLETED (publishing) or back.
    await expect(setStatus('COMPLETED')).rejects.toThrow();
    await expect(setStatus('IN_PROGRESS')).rejects.toThrow();
    await grade(attempt.attemptId, [award(attempt.essays[0]!.id, 4)]).expect(
      200,
    );
    // GRADED cannot go back to grading or to the learner's pending states.
    await expect(setStatus('NEEDS_GRADING')).rejects.toThrow();
    await expect(setStatus('IN_PROGRESS')).rejects.toThrow();
    // Publishing is the only way out, and it is final.
    await publish(attempt.attemptId).expect(200);
    await expect(setStatus('GRADED')).rejects.toThrow();
    await expect(setStatus('IN_PROGRESS')).rejects.toThrow();
    // Publishing twice is harmless; publishing something unfinished is not.
    expect((await publish(attempt.attemptId).expect(200)).body).toMatchObject({
      alreadyPublished: true,
    });
    const pending = await submitted(await quiz({ essays: [5] }));
    await publish(pending.attemptId).expect(409);
    expect((await attemptRow(pending.attemptId)).status).toBe('NEEDS_GRADING');
  });

  // A second learner, enrolled in Course A, for tests that need a fresh attempt.
  async function courseStudent() {
    const other = await e.account();
    await e.db.query(
      'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
      [other.id, courseA.id],
    );
    return other;
  }
});
