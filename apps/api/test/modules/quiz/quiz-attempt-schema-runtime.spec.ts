import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuthConfig } from '../../../src/auth/auth.config.js';
import { createAppDataSource } from '../../../src/database/typeorm.js';
import { migrateDatabase } from '../../../src/database/migrate.js';
import { revertThrough } from '../../support/migrations.js';
import { User } from '../../../src/users/user.entity.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

const options = createAppDataSource().options;

if (typeof options.database !== 'string' || !options.database.endsWith('_test'))
  throw new Error('Use an isolated PGDATABASE ending in _test');

type Queryable = { query: DataSource['query'] };

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

/**
 * Q1 (single, 10 pts): '4' correct, '5' wrong.
 * Q2 (multiple, 20 pts): '2' and '3' correct, '4' wrong.
 */
async function seedQuestions(db: Queryable, quizId: string) {
  const [q1] = await db.query(
    `INSERT INTO quiz_questions(quiz_id, content, position, points, explanation)
     VALUES ($1, '2 + 2 = ?', 1, 10, 'Arithmetic') RETURNING id`,
    [quizId],
  );
  const [q2] = await db.query(
    `INSERT INTO quiz_questions(quiz_id, type, content, position, points)
     VALUES ($1, 'MULTIPLE_CHOICE', 'Pick the primes', 2, 20) RETURNING id`,
    [quizId],
  );
  const rows = (await db.query(
    `INSERT INTO quiz_options(question_id, content, position, is_correct) VALUES
       ($1, '4', 1, true), ($1, '5', 2, false),
       ($2, '2', 1, true), ($2, '3', 2, true), ($2, '4', 3, false)
     RETURNING id, question_id AS "questionId", content`,
    [q1.id, q2.id],
  )) as Array<{ id: string; questionId: string; content: string }>;
  const option = (questionId: string, content: string) =>
    rows.find(
      (row) => row.questionId === questionId && row.content === content,
    )!.id;
  return {
    q1: q1.id as string,
    q2: q2.id as string,
    q1Four: option(q1.id, '4'),
    q1Five: option(q1.id, '5'),
    q2Two: option(q2.id, '2'),
    q2Three: option(q2.id, '3'),
    q2Four: option(q2.id, '4'),
  };
}

describe('Q5 quiz attempt schema', () => {
  const openSchemas: Array<{
    admin: DataSource;
    db: DataSource;
    schema: string;
  }> = [];

  afterEach(async () => {
    for (const { admin, db, schema } of openSchemas.splice(0)) {
      if (db.isInitialized) await db.destroy();
      if (admin.isInitialized) {
        await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await admin.destroy();
      }
    }
  });

  async function isolated() {
    const schema = `q5_${randomUUID().replaceAll('-', '')}`;
    const admin = await new DataSource(options).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const db = await new DataSource({
      ...options,
      schema,
      extra: {
        ...options.extra,
        options: `-c timezone=UTC -c search_path=${schema},public`,
      },
    } as DataSourceOptions).initialize();
    openSchemas.push({ admin, db, schema });
    await migrateDatabase(db);
    const user = await db.getRepository(User).save(
      db.getRepository(User).create({
        email: `q5-${randomUUID()}@example.invalid`,
        displayName: 'Q5',
      }),
    );
    const [quiz] = await db.query(
      `INSERT INTO quizzes(title, created_by, scope) VALUES ('Q5', $1, 'STANDALONE')
       RETURNING id`,
      [user.id],
    );
    const attempt = (attemptNumber: number, status = 'IN_PROGRESS') =>
      db.query<Array<{ id: string }>>(
        `INSERT INTO quiz_attempts(user_id, quiz_id, quiz_version, attempt_number,
           quiz_snapshot, status, submitted_at, score, is_passed,
           earned_points, total_points, percentage)
         SELECT $1, $2, 1, $3, '{"questions": []}', $4::"QuizAttemptStatus",
           CASE WHEN $4 IN ('SUBMITTED', 'TIMED_OUT') THEN now() END,
           CASE WHEN $4 IN ('SUBMITTED', 'TIMED_OUT') THEN 50 END,
           CASE WHEN $4 IN ('SUBMITTED', 'TIMED_OUT') THEN false END,
           CASE WHEN $4 IN ('SUBMITTED', 'TIMED_OUT') THEN 5 END,
           CASE WHEN $4 IN ('SUBMITTED', 'TIMED_OUT') THEN 10 END,
           CASE WHEN $4 IN ('SUBMITTED', 'TIMED_OUT') THEN 50 END
         RETURNING id`,
        [user.id, quiz.id, attemptNumber, status],
      );
    return { db, schema, userId: user.id, quizId: quiz.id as string, attempt };
  }

  const violation = (code: string, constraint: string) =>
    expect.objectContaining({ code, constraint });

  it('applies defaults and indexes, then reverts cleanly', async () => {
    const { db, schema, attempt } = await isolated();
    const [{ id }] = await attempt(1);
    const [row] = await db.query('SELECT * FROM quiz_attempts WHERE id=$1', [
      id,
    ]);
    expect(row).toMatchObject({
      status: 'IN_PROGRESS',
      expires_at: null,
      submitted_at: null,
      score: null,
      is_passed: null,
    });
    const [answer] = await db.query(
      `INSERT INTO attempt_answers(attempt_id, question_id) VALUES ($1, $2) RETURNING *`,
      [id, randomUUID()],
    );
    expect(answer).toMatchObject({
      selected_option_ids: [],
      is_correct: null,
      points_earned: 0,
    });

    const indexes = (
      (await db.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = $1`,
        [schema],
      )) as Array<{ indexname: string }>
    ).map(({ indexname }) => indexname);
    expect(indexes).toEqual(
      expect.arrayContaining([
        'IDX_quiz_attempts_user_quiz',
        'UQ_quiz_attempts_user_quiz_number',
        'UQ_quiz_attempts_active',
        'IDX_attempt_answers_attempt_question',
      ]),
    );

    await revertThrough(db, schema, 'QuizAttempts1791417600004');
    for (const name of ['quiz_attempts', 'attempt_answers'])
      expect(
        (
          await db.query('SELECT to_regclass($1) AS name', [
            `"${schema}".${name}`,
          ])
        )[0].name,
      ).toBeNull();
    expect(
      (
        await db.query('SELECT to_regtype($1) AS name', [
          `"${schema}"."QuizAttemptStatus"`,
        ])
      )[0].name,
    ).toBeNull();
  });

  it('keeps attempt numbers unique and one attempt active per user and quiz', async () => {
    const { attempt } = await isolated();
    await attempt(1, 'SUBMITTED');
    await expect(attempt(1, 'SUBMITTED')).rejects.toEqual(
      violation('23505', 'UQ_quiz_attempts_user_quiz_number'),
    );
    await attempt(2);
    await expect(attempt(3)).rejects.toEqual(
      violation('23505', 'UQ_quiz_attempts_active'),
    );
  });

  it('enforces the status/result state machine', async () => {
    const { db, attempt } = await isolated();
    const [{ id }] = await attempt(1);
    await expect(
      db.query(`UPDATE quiz_attempts SET status='SUBMITTED' WHERE id=$1`, [id]),
    ).rejects.toEqual(violation('23514', 'CHK_quiz_attempts_state'));
    await expect(
      db.query(`UPDATE quiz_attempts SET score=101 WHERE id=$1`, [id]),
    ).rejects.toEqual(violation('23514', 'CHK_quiz_attempts_score'));
    await expect(
      db.query(
        `UPDATE quiz_attempts SET expires_at = started_at - interval '1 minute' WHERE id=$1`,
        [id],
      ),
    ).rejects.toEqual(violation('23514', 'CHK_quiz_attempts_expires_at'));
  });

  it('freezes the snapshot, and closed attempts with their answers', async () => {
    const { db, attempt } = await isolated();
    const [{ id }] = await attempt(1);
    const questionId = randomUUID();
    await db.query(
      `INSERT INTO attempt_answers(attempt_id, question_id) VALUES ($1, $2)`,
      [id, questionId],
    );

    await expect(
      db.query(
        `UPDATE quiz_attempts SET quiz_snapshot = '{"questions": [1]}' WHERE id=$1`,
        [id],
      ),
    ).rejects.toEqual(violation('23000', 'TRG_quiz_attempts_immutable'));
    await expect(
      db.query(`UPDATE quiz_attempts SET attempt_number = 9 WHERE id=$1`, [id]),
    ).rejects.toEqual(violation('23000', 'TRG_quiz_attempts_immutable'));

    // SUBMITTING: answers frozen except for grading, no way back.
    await db.query(`UPDATE quiz_attempts SET status='SUBMITTING' WHERE id=$1`, [
      id,
    ]);
    await expect(
      db.query(
        `UPDATE attempt_answers SET selected_option_ids = ARRAY[$2::uuid] WHERE attempt_id=$1`,
        [id, randomUUID()],
      ),
    ).rejects.toEqual(violation('23000', 'TRG_attempt_answers_open_attempt'));
    await db.query(
      `UPDATE attempt_answers SET is_correct=false, points_earned=0 WHERE attempt_id=$1`,
      [id],
    );
    await expect(
      db.query(`UPDATE quiz_attempts SET status='IN_PROGRESS' WHERE id=$1`, [
        id,
      ]),
    ).rejects.toEqual(violation('23000', 'TRG_quiz_attempts_submitting'));
    // Closing requires the whole official result.
    await expect(
      db.query(
        `UPDATE quiz_attempts SET status='SUBMITTED', submitted_at=now(), score=0,
           is_passed=false WHERE id=$1`,
        [id],
      ),
    ).rejects.toEqual(violation('23514', 'CHK_quiz_attempts_state'));
    await expect(
      db.query(
        `UPDATE quiz_attempts SET status='SUBMITTED', submitted_at=now(), score=0,
           is_passed=false, earned_points=11, total_points=10, percentage=0
         WHERE id=$1`,
        [id],
      ),
    ).rejects.toEqual(violation('23514', 'CHK_quiz_attempts_points'));
    await db.query(
      `UPDATE quiz_attempts SET status='SUBMITTED', submitted_at=now(), score=0,
         is_passed=false, earned_points=0, total_points=10, percentage=0
       WHERE id=$1`,
      [id],
    );
    await expect(
      db.query(`UPDATE quiz_attempts SET score=100 WHERE id=$1`, [id]),
    ).rejects.toEqual(violation('23000', 'TRG_quiz_attempts_closed'));
    await expect(
      db.query(
        `UPDATE attempt_answers SET selected_option_ids = ARRAY[$2::uuid] WHERE attempt_id=$1`,
        [id, randomUUID()],
      ),
    ).rejects.toEqual(violation('23000', 'TRG_attempt_answers_open_attempt'));
    await expect(
      db.query(
        `INSERT INTO attempt_answers(attempt_id, question_id) VALUES ($1, $2)`,
        [id, randomUUID()],
      ),
    ).rejects.toEqual(violation('23000', 'TRG_attempt_answers_open_attempt'));
  });

  it('keeps one answer per question and restricts deleting attempted quizzes', async () => {
    const { db, userId, quizId, attempt } = await isolated();
    const [{ id }] = await attempt(1);
    const questionId = randomUUID();
    await db.query(
      `INSERT INTO attempt_answers(attempt_id, question_id) VALUES ($1, $2)`,
      [id, questionId],
    );
    await expect(
      db.query(
        `INSERT INTO attempt_answers(attempt_id, question_id) VALUES ($1, $2)`,
        [id, questionId],
      ),
    ).rejects.toEqual(
      violation('23505', 'IDX_attempt_answers_attempt_question'),
    );

    await expect(
      db.query('DELETE FROM quizzes WHERE id=$1', [quizId]),
    ).rejects.toEqual(violation('23503', 'FK_quiz_attempts_quizzes'));
    await expect(
      db.query('DELETE FROM users WHERE id=$1', [userId]),
    ).rejects.toEqual(expect.objectContaining({ code: '23503' }));
    // Deleting the attempt itself cascades to its answers.
    await db.query('DELETE FROM quiz_attempts WHERE id=$1', [id]);
    expect(
      (
        await db.query(
          'SELECT count(*)::int AS n FROM attempt_answers WHERE attempt_id=$1',
          [id],
        )
      )[0].n,
    ).toBe(0);
  });
});

describe('Q5 quiz attempt runtime over HTTP', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q5');
    origin = t.app.get(AuthConfig).origin;
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  async function quiz(
    settings: {
      durationMinutes?: number | null;
      maxAttempts?: number | null;
      shuffle?: boolean;
    } = {},
  ) {
    const [row] = await t.db.query(
      `INSERT INTO quizzes(title, created_by, scope, target_id, status,
         duration_minutes, max_attempts, shuffle_questions, shuffle_options)
       VALUES ('Runtime', $1, 'LESSON', $2, 'PUBLISHED', $3, $4, $5, $5)
       RETURNING id`,
      [
        owner.id,
        course.lessons[0]!.id,
        settings.durationMinutes ?? null,
        settings.maxAttempts ?? null,
        settings.shuffle ?? false,
      ],
    );
    return { id: row.id as string, ...(await seedQuestions(t.db, row.id)) };
  }

  const start = (session: string, quizId: string) =>
    t
      .http()
      .post(`/quizzes/${quizId}/attempts`)
      .set('Origin', origin)
      .set('Cookie', session);
  const active = (session: string, quizId: string) =>
    t.http().get(`/quizzes/${quizId}/active-attempt`).set('Cookie', session);
  const save = (
    session: string,
    attemptId: string,
    questionId: string,
    selectedOptionIds: string[],
  ) =>
    t
      .http()
      .put(`/quiz-attempts/${attemptId}/answers`)
      .set('Origin', origin)
      .set('Cookie', session)
      .send({ questionId, selectedOptionIds });
  const submit = (session: string, attemptId: string) =>
    t
      .http()
      .post(`/quiz-attempts/${attemptId}/submit`)
      .set('Origin', origin)
      .set('Cookie', session);
  const storedSnapshot = async (attemptId: string) =>
    (
      await t.db.query('SELECT quiz_snapshot FROM quiz_attempts WHERE id=$1', [
        attemptId,
      ])
    )[0].quiz_snapshot;

  it('keeps the attempt snapshot intact while the quiz is edited and deleted', async () => {
    const q = await quiz();
    const started = await start(student.session, q.id).expect(201);
    const frozen = await storedSnapshot(started.body.id);
    expect(
      frozen.questions.map((question: { id: string }) => question.id),
    ).toEqual([q.q1, q.q2]);

    // The instructor rewrites the quiz under the running attempt.
    await t.db.query(
      `UPDATE quiz_questions SET content='Changed', points=99 WHERE id=$1`,
      [q.q1],
    );
    await t.db.query(
      `UPDATE quiz_options SET is_correct = NOT is_correct, content='X' WHERE question_id=$1`,
      [q.q1],
    );
    await t.db.query('DELETE FROM quiz_questions WHERE id=$1', [q.q2]);
    await t.db.query(
      `INSERT INTO quiz_questions(quiz_id, content, position) VALUES ($1, 'Brand new', 3)`,
      [q.id],
    );
    await t.db.query(
      `UPDATE quizzes SET passing_score=0, version=2 WHERE id=$1`,
      [q.id],
    );

    expect(await storedSnapshot(started.body.id)).toEqual(frozen);
    const resumed = await active(student.session, q.id).expect(200);
    expect(resumed.body.id).toBe(started.body.id);
    expect(resumed.body.quiz.passingScore).toBe(80);
    expect(
      resumed.body.quiz.questions.map(
        (question: { content: string; points: number }) => [
          question.content,
          question.points,
        ],
      ),
    ).toEqual([
      ['2 + 2 = ?', 10],
      ['Pick the primes', 20],
    ]);
    expect(
      resumed.body.quiz.questions[0].options.map(
        (option: { content: string }) => option.content,
      ),
    ).toEqual(['4', '5']);

    // A deleted authoring question still accepts answers inside the snapshot.
    await save(student.session, started.body.id, q.q1, [q.q1Four]).expect(200);
    await save(student.session, started.body.id, q.q2, [
      q.q2Two,
      q.q2Three,
    ]).expect(200);
    // Graded against the frozen key, not the flipped live one.
    const result = await submit(student.session, started.body.id).expect(200);
    expect(result.body).toMatchObject({
      status: 'COMPLETED',
      score: 100,
      isPassed: true,
    });
    const [row] = await t.db.query(
      'SELECT quiz_version FROM quiz_attempts WHERE id=$1',
      [started.body.id],
    );
    expect(row.quiz_version).toBe(1);
  });

  it('autosaves answers and restores them on reload and on another device', async () => {
    const q = await quiz({ durationMinutes: 30 });
    const started = await start(student.session, q.id).expect(201);
    const attemptId = started.body.id as string;
    expect(started.body.answers).toEqual([]);
    expect(new Date(started.body.expiresAt).getTime()).toBe(
      new Date(started.body.startedAt).getTime() + 30 * 60_000,
    );

    const first = await save(student.session, attemptId, q.q1, [
      q.q1Five,
    ]).expect(200);
    await save(student.session, attemptId, q.q2, [q.q2Two, q.q2Four]).expect(
      200,
    );
    // Changing an answer upserts the same row and moves saved_at forward.
    const changed = await save(student.session, attemptId, q.q1, [
      q.q1Four,
    ]).expect(200);
    expect(new Date(changed.body.savedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.body.savedAt).getTime(),
    );
    const [{ rows }] = await t.db.query(
      'SELECT count(*)::int AS rows FROM attempt_answers WHERE attempt_id=$1',
      [attemptId],
    );
    expect(rows).toBe(2);

    // Another device: a separate session for the same learner.
    const laptop = await t.login(student.email);
    const restored = await active(laptop, q.id).expect(200);
    expect(restored.headers['cache-control']).toBe('private, no-store');
    expect(restored.body).toMatchObject({
      id: attemptId,
      status: 'IN_PROGRESS',
      attemptNumber: 1,
      expiresAt: started.body.expiresAt,
    });
    expect(restored.body.answers).toEqual(
      expect.arrayContaining([
        {
          questionId: q.q1,
          selectedOptionId: q.q1Four,
          selectedOptionIds: [q.q1Four],
          savedAt: changed.body.savedAt,
        },
        {
          questionId: q.q2,
          selectedOptionId: null,
          selectedOptionIds: [q.q2Two, q.q2Four],
          savedAt: expect.any(String),
        },
      ]),
    );
    expect(restored.body.answers).toHaveLength(2);
    for (const key of [
      'isCorrect',
      'is_correct',
      'explanation',
      'quizSnapshot',
    ])
      expect(allKeys(restored.body)).not.toContain(key);

    // Starting again (e.g. a reload hitting "start") resumes, it does not fork.
    const again = await start(laptop, q.id).expect(200);
    expect(again.body.id).toBe(attemptId);
    expect(again.body.answers).toHaveLength(2);
  });

  it('keeps a shuffled order stable across resumes', async () => {
    const q = await quiz({ shuffle: true });
    const started = await start(student.session, q.id).expect(201);
    const order = (body: {
      quiz: {
        questions: Array<{ id: string; options: Array<{ id: string }> }>;
      };
    }) =>
      body.quiz.questions.map((question) => [
        question.id,
        question.options.map((option) => option.id),
      ]);
    const resumed = await active(student.session, q.id).expect(200);
    expect(order(resumed.body)).toEqual(order(started.body));
    expect(
      order(started.body)
        .map(([id]) => id as string)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual([q.q1, q.q2].sort((a, b) => a.localeCompare(b)));
  });

  it('detects an expired attempt on resume and closes it as TIMED_OUT', async () => {
    const q = await quiz({ durationMinutes: 30 });
    const started = await start(student.session, q.id).expect(201);
    const attemptId = started.body.id as string;
    await save(student.session, attemptId, q.q1, [q.q1Four]).expect(200);
    await t.db.query(
      `UPDATE quiz_attempts SET expires_at = started_at + interval '1 millisecond'
       WHERE id=$1`,
      [attemptId],
    );

    const timedOut = await active(student.session, q.id).expect(200);
    expect(timedOut.body).toMatchObject({
      id: attemptId,
      status: 'TIMED_OUT',
      score: 33,
      isPassed: false,
    });
    expect(timedOut.body.quiz).toBeUndefined();
    expect(timedOut.body.answers).toBeUndefined();

    const [row] = await t.db.query(
      `SELECT status, submitted_at = expires_at AS "atDeadline"
       FROM quiz_attempts WHERE id=$1`,
      [attemptId],
    );
    expect(row).toEqual({ status: 'TIMED_OUT', atDeadline: true });
    expect(
      await t.db.query(
        `SELECT question_id AS "questionId", is_correct AS "isCorrect",
           points_earned AS "pointsEarned"
         FROM attempt_answers WHERE attempt_id=$1`,
        [attemptId],
      ),
    ).toEqual([{ questionId: q.q1, isCorrect: true, pointsEarned: 10 }]);

    expect((await active(student.session, q.id).expect(404)).body.code).toBe(
      'NO_ACTIVE_ATTEMPT',
    );
    expect(
      (await save(student.session, attemptId, q.q1, [q.q1Five]).expect(409))
        .body.code,
    ).toBe('ATTEMPT_NOT_IN_PROGRESS');
  });

  it('rejects an autosave past the deadline and records the timeout', async () => {
    const q = await quiz({ durationMinutes: 5 });
    const started = await start(student.session, q.id).expect(201);
    await t.db.query(
      `UPDATE quiz_attempts SET expires_at = started_at + interval '1 millisecond'
       WHERE id=$1`,
      [started.body.id],
    );
    expect(
      (
        await save(student.session, started.body.id, q.q1, [q.q1Four]).expect(
          400,
        )
      ).body.code,
    ).toBe('ATTEMPT_EXPIRED');
    const [row] = await t.db.query(
      'SELECT status FROM quiz_attempts WHERE id=$1',
      [started.body.id],
    );
    expect(row.status).toBe('TIMED_OUT');
  });

  it('validates autosaves against the snapshot', async () => {
    const q = await quiz();
    const attemptId = (await start(student.session, q.id).expect(201)).body
      .id as string;
    const code = async (questionId: string, ids: string[], status = 400) =>
      (await save(student.session, attemptId, questionId, ids).expect(status))
        .body.code;

    expect(await code(randomUUID(), [])).toBe('QUESTION_NOT_IN_SNAPSHOT');
    expect(await code(q.q1, [q.q2Two])).toBe('INVALID_OPTION_FOR_QUESTION');
    expect(await code(q.q1, [q.q1Four, q.q1Five])).toBe(
      'INVALID_RESPONSE_TYPE',
    );
    await save(student.session, attemptId, q.q1, ['not-a-uuid']).expect(400);
    await save(student.session, attemptId, q.q1, [q.q1Four, q.q1Four]).expect(
      400,
    );
    // Clearing an answer is allowed.
    await save(student.session, attemptId, q.q1, []).expect(200);

    // Another learner cannot see or write this attempt.
    const other = await t.account();
    await t.db.query(
      'INSERT INTO enrollments(user_id, course_id) VALUES ($1, $2)',
      [other.id, course.id],
    );
    await save(other.session, attemptId, q.q1, [q.q1Four]).expect(404);
    await submit(other.session, attemptId).expect(404);
  });

  it('grades on submit, is idempotent and enforces maxAttempts', async () => {
    const q = await quiz({ maxAttempts: 1 });
    const attemptId = (await start(student.session, q.id).expect(201)).body
      .id as string;
    await save(student.session, attemptId, q.q1, [q.q1Four]).expect(200);
    // Partially right on a multiple choice question earns nothing.
    await save(student.session, attemptId, q.q2, [q.q2Two]).expect(200);

    const first = await submit(student.session, attemptId).expect(200);
    expect(first.body).toMatchObject({
      status: 'COMPLETED',
      score: 33,
      isPassed: false,
    });
    const again = await submit(student.session, attemptId).expect(200);
    expect(again.body).toMatchObject({
      status: 'COMPLETED',
      score: 33,
      submittedAt: first.body.submittedAt,
    });
    expect((await start(student.session, q.id).expect(409)).body.code).toBe(
      'MAX_ATTEMPTS_REACHED',
    );
  });

  it('serializes concurrent starts into a single attempt', async () => {
    const q = await quiz();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => start(student.session, q.id)),
    );
    expect(responses.map(({ status }) => status).sort((a, b) => a - b)).toEqual(
      [200, 200, 200, 200, 201],
    );
    expect(new Set(responses.map(({ body }) => body.id)).size).toBe(1);
  });

  it('requires access to the quiz and the Origin header', async () => {
    const q = await quiz();
    const outsider = await t.account();
    await start(outsider.session, q.id).expect(403);
    await t
      .http()
      .post(`/quizzes/${q.id}/attempts`)
      .set('Cookie', student.session)
      .expect(403);
  });
});
