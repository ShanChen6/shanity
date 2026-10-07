import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import type { QuizAttemptSnapshot } from '../../../src/modules/quiz/services/quiz-attempt-snapshot.js';
import { gradeAttempt } from '../../../src/modules/quiz/services/quiz-grading.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

type Question = {
  id: string;
  options: Array<{ id: string; content: string; isCorrect: boolean }>;
};

describe('Q11 versioning and immutable attempt snapshots', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let userA: Account;
  let userB: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q11');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    userA = await t.account();
    userB = await t.account();
    course = await t.course(owner, 1, [userA, userB]);
  });
  afterAll(() => t?.app.close());

  const call = (
    method: 'post' | 'put' | 'delete',
    path: string,
    session: string,
    body?: object,
  ) => {
    const pending = t
      .http()
      [method](path)
      .set('Origin', origin)
      .set('Cookie', session);
    return body ? pending.send(body) : pending;
  };

  // Instructor authoring, all through the public API.
  async function draftQuiz() {
    const response = await call('post', '/admin/quizzes', owner.session, {
      title: `Q11 ${randomUUID().slice(0, 8)}`,
      scope: 'LESSON',
      targetId: course.lessons[0]!.id,
      passingScore: 80,
      durationMinutes: 30,
      reviewPolicy: 'AFTER_SUBMIT',
      gradingPolicy: 'HIGHEST',
      shuffleQuestions: false,
      shuffleOptions: false,
    }).expect(201);
    return response.body.id as string;
  }
  async function addQuestion(quizId: string, content: string, points: number) {
    const response = await call(
      'post',
      `/admin/quizzes/${quizId}/questions`,
      owner.session,
      {
        content,
        points,
        explanation: `Why: ${content}`,
        options: [
          { content: 'Option A', isCorrect: true },
          { content: 'Option B' },
        ],
      },
    ).expect(201);
    return response.body as Question;
  }
  const publish = (quizId: string) =>
    call('post', `/admin/quizzes/${quizId}/publish`, owner.session);
  const openNewVersion = (quizId: string, session = owner.session) =>
    call('post', `/admin/quizzes/${quizId}/versions`, session);

  // Learner runtime.
  const start = (session: string, quizId: string) =>
    call('post', `/quizzes/${quizId}/attempts`, session);
  const save = (
    session: string,
    attemptId: string,
    questionId: string,
    selectedOptionIds: string[],
  ) =>
    call('put', `/quiz-attempts/${attemptId}/answers`, session, {
      questionId,
      selectedOptionIds,
    });
  const submit = (session: string, attemptId: string) =>
    call('post', `/quiz-attempts/${attemptId}/submit`, session);

  async function storedAttempt(attemptId: string) {
    const [row] = await t.db.query(
      `SELECT quiz_version AS "quizVersion", quiz_snapshot AS "snapshot",
         score, is_passed AS "isPassed"
       FROM quiz_attempts WHERE id = $1`,
      [attemptId],
    );
    const answers = await t.db.query(
      `SELECT question_id AS "questionId",
         selected_option_ids AS "selectedOptionIds",
         is_correct AS "isCorrect", points_earned AS "pointsEarned"
       FROM attempt_answers WHERE attempt_id = $1 ORDER BY question_id`,
      [attemptId],
    );
    return {
      ...(row as {
        quizVersion: number;
        snapshot: QuizAttemptSnapshot;
        score: number;
        isPassed: boolean;
      }),
      answers: answers as Array<{
        questionId: string;
        selectedOptionIds: string[];
        isCorrect: boolean;
        pointsEarned: number;
      }>,
    };
  }

  /** v1: Q1 (10 pts) and Q2 (20 pts), "Option A" correct in both. */
  async function publishedV1() {
    const quizId = await draftQuiz();
    const q1 = await addQuestion(quizId, 'TypeScript là gì?', 10);
    const q2 = await addQuestion(quizId, 'Kiểu nào là nguyên thủy?', 20);
    const published = await publish(quizId).expect(200);
    expect(published.body).toMatchObject({ version: 1, status: 'PUBLISHED' });
    return { quizId, q1, q2 };
  }

  it('freezes every field grading needs into the snapshot at start', async () => {
    const { quizId, q1, q2 } = await publishedV1();
    const started = await start(userA.session, quizId).expect(201);
    const { snapshot, quizVersion } = await storedAttempt(started.body.id);

    expect(quizVersion).toBe(1);
    expect(snapshot.quiz).toMatchObject({
      id: quizId,
      version: 1,
      passingScore: 80,
      durationMinutes: 30,
      reviewPolicy: 'AFTER_SUBMIT',
      gradingPolicy: 'HIGHEST',
    });
    expect(snapshot.questions).toEqual(
      [q1, q2].map((question, index) => ({
        id: question.id,
        type: 'SINGLE_CHOICE',
        content: index ? 'Kiểu nào là nguyên thủy?' : 'TypeScript là gì?',
        position: index + 1,
        points: index ? 20 : 10,
        explanation: `Why: ${index ? 'Kiểu nào là nguyên thủy?' : 'TypeScript là gì?'}`,
        options: question.options.map((option, position) => ({
          id: option.id,
          content: option.content,
          position: position + 1,
          isCorrect: option.isCorrect,
        })),
      })),
    );
    await submit(userA.session, started.body.id).expect(200);
  });

  it('grades a v1 attempt by the v1 key after v2 moves the correct option', async () => {
    const { quizId, q1, q2 } = await publishedV1();
    const [q1OptA, q1OptB] = q1.options;

    // User A starts on v1, where Option A is correct.
    const attemptV1 = await start(userA.session, quizId).expect(201);

    // The instructor opens v2 and moves Q1's key from Option A to Option B.
    const opened = await openNewVersion(quizId).expect(201);
    expect(opened.body).toMatchObject({ version: 2, status: 'DRAFT' });
    const edited = await call(
      'put',
      `/admin/options/${q1OptB!.id}`,
      owner.session,
      {
        isCorrect: true,
      },
    ).expect(200);
    expect(
      edited.body.options.map(
        (option: { isCorrect: boolean }) => option.isCorrect,
      ),
    ).toEqual([false, true]);
    await call(
      'put',
      `/admin/quizzes/${quizId}/questions/${q1.id}`,
      owner.session,
      {
        points: 50,
      },
    ).expect(200);
    await call('put', `/admin/quizzes/${quizId}`, owner.session, {
      passingScore: 100,
    }).expect(200);
    expect((await publish(quizId).expect(200)).body).toMatchObject({
      version: 2,
      status: 'PUBLISHED',
    });

    // User A still answers Option A and is graded correct, by v1 rules.
    await save(userA.session, attemptV1.body.id, q1.id, [q1OptA!.id]).expect(
      200,
    );
    await save(userA.session, attemptV1.body.id, q2.id, [
      q2.options[0]!.id,
    ]).expect(200);
    const result = await submit(userA.session, attemptV1.body.id).expect(200);
    expect(result.body).toMatchObject({
      status: 'SUBMITTED',
      score: 100,
      isPassed: true,
    });
    const stored = await storedAttempt(attemptV1.body.id);
    expect(stored.quizVersion).toBe(1);
    expect(stored.snapshot.quiz.passingScore).toBe(80);
    expect(stored.answers).toEqual(
      expect.arrayContaining([
        {
          questionId: q1.id,
          selectedOptionIds: [q1OptA!.id],
          isCorrect: true,
          pointsEarned: 10,
        },
      ]),
    );

    // Control: the same answer on a v2 attempt is graded by the v2 key.
    const attemptV2 = await start(userB.session, quizId).expect(201);
    const v2 = await storedAttempt(attemptV2.body.id);
    expect(v2.quizVersion).toBe(2);
    expect(v2.snapshot.quiz).toMatchObject({ version: 2, passingScore: 100 });
    await save(userB.session, attemptV2.body.id, q1.id, [q1OptA!.id]).expect(
      200,
    );
    await save(userB.session, attemptV2.body.id, q2.id, [
      q2.options[0]!.id,
    ]).expect(200);
    const v2Result = await submit(userB.session, attemptV2.body.id).expect(200);
    // 20 of 70 points: Q1 wrong under the v2 key.
    expect(v2Result.body).toMatchObject({
      earnedPoints: 20,
      totalPoints: 70,
      percentage: 28.57,
      score: 28,
      isPassed: false,
    });

    // User A's history is untouched by the v2 attempt and by later edits.
    expect(await storedAttempt(attemptV1.body.id)).toEqual(stored);
  });

  it('keeps a deleted question and the v1 total in an old attempt', async () => {
    const { quizId, q1, q2 } = await publishedV1();
    const attemptV1 = await start(userA.session, quizId).expect(201);

    // The instructor deletes Q2 in v2.
    await openNewVersion(quizId).expect(201);
    await call(
      'delete',
      `/admin/quizzes/${quizId}/questions/${q2.id}`,
      owner.session,
    ).expect(200);
    await publish(quizId).expect(200);
    const [{ live }] = await t.db.query(
      'SELECT count(*)::int AS live FROM quiz_questions WHERE id = $1',
      [q2.id],
    );
    expect(live).toBe(0);

    // The running v1 attempt still shows, accepts and grades Q2.
    const resumed = await t
      .http()
      .get(`/quizzes/${quizId}/active-attempt`)
      .set('Cookie', userA.session)
      .expect(200);
    expect(
      resumed.body.quiz.questions.map(
        (question: { id: string }) => question.id,
      ),
    ).toEqual([q1.id, q2.id]);
    await save(userA.session, attemptV1.body.id, q1.id, [
      q1.options[0]!.id,
    ]).expect(200);
    await save(userA.session, attemptV1.body.id, q2.id, [
      q2.options[1]!.id,
    ]).expect(200);
    const result = await submit(userA.session, attemptV1.body.id).expect(200);
    // 10 of the v1 total of 30 points, not 10 of v2's 10.
    expect(result.body).toMatchObject({ score: 33, isPassed: false });

    const stored = await storedAttempt(attemptV1.body.id);
    expect(stored.snapshot.questions.map(({ id }) => id)).toEqual([
      q1.id,
      q2.id,
    ]);
    expect(
      stored.snapshot.questions.reduce((sum, { points }) => sum + points, 0),
    ).toBe(30);
    expect(stored.answers).toHaveLength(2);
    expect(
      stored.answers.find(({ questionId }) => questionId === q2.id),
    ).toMatchObject({ isCorrect: false, pointsEarned: 0 });

    // The snapshot alone reproduces the recorded grade.
    const regraded = gradeAttempt(stored.snapshot, stored.answers);
    expect(regraded).toMatchObject({
      earnedPoints: 10,
      totalPoints: 30,
      score: stored.score,
      isPassed: stored.isPassed,
    });

    // New attempts get v2, which no longer has Q2.
    const attemptV2 = await start(userB.session, quizId).expect(201);
    const v2 = await storedAttempt(attemptV2.body.id);
    expect(v2.snapshot.questions.map(({ id }) => id)).toEqual([q1.id]);
    await submit(userB.session, attemptV2.body.id).expect(200);
  });

  it('opens new versions only from PUBLISHED and pauses new starts until republished', async () => {
    const { quizId } = await publishedV1();
    const running = await start(userA.session, quizId).expect(201);

    // Learners cannot fork versions.
    await openNewVersion(quizId, userB.session).expect(403);

    await openNewVersion(quizId).expect(201);
    const again = await openNewVersion(quizId).expect(409);
    expect(again.body.code).toBe('QUIZ_NOT_PUBLISHED');
    const [{ version }] = await t.db.query(
      'SELECT version FROM quizzes WHERE id = $1',
      [quizId],
    );
    expect(version).toBe(2);

    // The v2 draft is not startable, but the running v1 attempt finishes.
    const blocked = await start(userB.session, quizId).expect(403);
    expect(blocked.body.code).toBe('QUIZ_FORBIDDEN');
    await submit(userA.session, running.body.id).expect(200);

    await publish(quizId).expect(200);
    const next = await start(userB.session, quizId).expect(201);
    expect((await storedAttempt(next.body.id)).quizVersion).toBe(2);
    await submit(userB.session, next.body.id).expect(200);
  });
});
