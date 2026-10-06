import { randomUUID } from 'node:crypto';
import { instanceToPlain } from 'class-transformer';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createAppDataSource } from '../../../src/database/typeorm.js';
import { migrateDatabase } from '../../../src/database/migrate.js';
import { revertThrough } from '../../support/migrations.js';
import { QuizOptionEntity } from '../../../src/modules/quiz/entities/quiz-option.entity.js';
import { QuizQuestionEntity } from '../../../src/modules/quiz/entities/quiz-question.entity.js';
import { User } from '../../../src/users/user.entity.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

const options = createAppDataSource().options;

if (typeof options.database !== 'string' || !options.database.endsWith('_test'))
  throw new Error('Use an isolated PGDATABASE ending in _test');

const SECRET_KEYS = ['isCorrect', 'is_correct', 'explanation'];
const EXPLANATION =
  'Because 4 is the only even prime... not. Secret rationale.';

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

type Queryable = { query: DataSource['query'] };

/** Two questions inserted out of order; each has one correct option. */
async function seedQuestions(db: Queryable, quizId: string) {
  const [second] = await db.query(
    `INSERT INTO quiz_questions(quiz_id, type, content, position, points, explanation)
     VALUES ($1, 'MULTIPLE_CHOICE', 'Pick the primes', 2, 20, $2) RETURNING id`,
    [quizId, EXPLANATION],
  );
  const [first] = await db.query(
    `INSERT INTO quiz_questions(quiz_id, content, position, explanation)
     VALUES ($1, '2 + 2 = ?', 1, $2) RETURNING id`,
    [quizId, EXPLANATION],
  );
  await db.query(
    `INSERT INTO quiz_options(question_id, content, position, is_correct) VALUES
       ($1, '5', 2, false), ($1, '4', 1, true),
       ($2, '2', 1, true), ($2, '3', 2, true), ($2, '4', 3, false)`,
    [first.id, second.id],
  );
  return { firstId: first.id as string, secondId: second.id as string };
}

describe('Q4 quiz question schema', () => {
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
    const schema = `q4_${randomUUID().replaceAll('-', '')}`;
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
        email: `q4-${randomUUID()}@example.invalid`,
        displayName: 'Q4',
      }),
    );
    const [quiz] = await db.query(
      `INSERT INTO quizzes(title, created_by, scope) VALUES ('Q4', $1, 'STANDALONE')
       RETURNING id`,
      [user.id],
    );
    return { db, schema, quizId: quiz.id as string };
  }

  it('applies defaults, indexes and reverts cleanly', async () => {
    const { db, schema, quizId } = await isolated();
    const [question] = await db.query(
      `INSERT INTO quiz_questions(quiz_id, content) VALUES ($1, 'Q') RETURNING *`,
      [quizId],
    );
    expect(question).toMatchObject({
      type: 'SINGLE_CHOICE',
      position: 1,
      points: 10,
      explanation: null,
    });
    const [option] = await db.query(
      `INSERT INTO quiz_options(question_id, content) VALUES ($1, 'A') RETURNING *`,
      [question.id],
    );
    expect(option).toMatchObject({ position: 1, is_correct: false });

    const indexes = (await db.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = $1`,
      [schema],
    )) as Array<{ indexname: string }>;
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        'IDX_quiz_questions_quiz_position',
        'IDX_quiz_options_question_position',
      ]),
    );

    // Choice-only: no essay/free-text answer columns.
    const columns = (await db.query(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = $1 AND table_name IN ('quiz_questions', 'quiz_options')`,
      [schema],
    )) as Array<{ table_name: string; column_name: string }>;
    expect(
      columns
        .filter(({ table_name }) => table_name === 'quiz_questions')
        .map(({ column_name }) => column_name)
        .sort(),
    ).toEqual(
      [
        'id',
        'quiz_id',
        'type',
        'content',
        'position',
        'points',
        'explanation',
        'created_at',
        'updated_at',
      ].sort(),
    );
    const [{ labels }] = await db.query(
      `SELECT array_agg(enumlabel::text ORDER BY enumsortorder) AS labels
       FROM pg_enum enum JOIN pg_type type ON type.oid = enum.enumtypid
       JOIN pg_namespace ns ON ns.oid = type.typnamespace
       WHERE type.typname = 'QuizQuestionType' AND ns.nspname = $1`,
      [schema],
    );
    expect(labels).toEqual(['SINGLE_CHOICE', 'MULTIPLE_CHOICE']);

    await revertThrough(db, schema, 'QuizQuestionsOptions1791417600003');
    for (const name of ['quiz_questions', 'quiz_options'])
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
          `"${schema}"."QuizQuestionType"`,
        ])
      )[0].name,
    ).toBeNull();
  });

  it('cascades quiz deletion to questions and options', async () => {
    const { db, quizId } = await isolated();
    const { firstId, secondId } = await seedQuestions(db, quizId);

    await db.query('DELETE FROM quizzes WHERE id = $1', [quizId]);
    const [{ questions, opts }] = await db.query(
      `SELECT
         (SELECT count(*)::int FROM quiz_questions WHERE quiz_id = $1) AS questions,
         (SELECT count(*)::int FROM quiz_options WHERE question_id = ANY($2)) AS opts`,
      [quizId, [firstId, secondId]],
    );
    expect({ questions, opts }).toEqual({ questions: 0, opts: 0 });
  });

  it('rejects non-positive points and blank content', async () => {
    const { db, quizId } = await isolated();
    for (const points of [0, -5])
      await expect(
        db.query(
          `INSERT INTO quiz_questions(quiz_id, content, points) VALUES ($1, 'Q', $2)`,
          [quizId, points],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'CHK_quiz_questions_points',
      });
    await expect(
      db.query(
        `INSERT INTO quiz_questions(quiz_id, content) VALUES ($1, '   ')`,
        [quizId],
      ),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'CHK_quiz_questions_content',
    });
  });

  it('excludes the answer key and explanation when an entity is serialized', () => {
    const option = Object.assign(new QuizOptionEntity(), {
      id: randomUUID(),
      content: '4',
      position: 1,
      isCorrect: true,
    });
    const question = Object.assign(new QuizQuestionEntity(), {
      id: randomUUID(),
      content: '2 + 2 = ?',
      explanation: EXPLANATION,
      options: [option],
    });
    const plain = instanceToPlain(question);
    expect(allKeys(plain)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/isCorrect|explanation/)]),
    );
    expect(plain.options[0]).toEqual({
      id: option.id,
      content: '4',
      position: 1,
    });
  });
});

describe('Q4 quiz answer key security over HTTP', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let student: Account;
  let course: Awaited<ReturnType<typeof t.course>>;

  beforeAll(async () => {
    t = await learningApp('quiz-q4');
    owner = await t.account('instructor');
    student = await t.account();
    course = await t.course(owner, 1, [student]);
  });
  afterAll(() => t?.app.close());

  async function quiz(
    scope: 'LESSON' | 'CHAPTER' | 'COURSE' | 'STANDALONE',
    targetId: string | null,
    status = 'PUBLISHED',
  ) {
    const [row] = await t.db.query(
      `INSERT INTO quizzes(title, created_by, scope, target_id, status)
       VALUES ('Arithmetic', $1, $2, $3, $4) RETURNING id`,
      [owner.id, scope, targetId, status],
    );
    await seedQuestions(t.db, row.id);
    return row.id as string;
  }
  const take = (session: string, id: string) =>
    t.http().get(`/quizzes/${id}/take`).set('Cookie', session);
  const manage = (session: string, id: string) =>
    t.http().get(`/admin/quizzes/${id}/questions`).set('Cookie', session);

  it('serves the learner view without any answer key or explanation', async () => {
    const id = await quiz('LESSON', course.lessons[0]!.id);
    const response = await take(student.session, id).expect(200);

    expect(response.headers['cache-control']).toBe('private, no-store');
    for (const key of SECRET_KEYS) {
      expect(allKeys(response.body)).not.toContain(key);
      expect(response.text).not.toContain(`"${key}"`);
    }
    expect(response.text).not.toContain('Secret rationale');

    const { questions } = response.body as {
      questions: Array<Record<string, unknown>>;
    };
    expect(questions.map((question) => question.content)).toEqual([
      '2 + 2 = ?',
      'Pick the primes',
    ]);
    for (const question of questions) {
      expect(Object.keys(question).sort()).toEqual(
        ['id', 'type', 'content', 'position', 'points', 'options'].sort(),
      );
      for (const option of question.options as Array<object>)
        expect(Object.keys(option).sort()).toEqual([
          'content',
          'id',
          'position',
        ]);
    }
    expect(
      (questions[0]!.options as Array<{ content: string }>).map(
        (option) => option.content,
      ),
    ).toEqual(['4', '5']);
  });

  it('applies the same redaction to course-wide quizzes', async () => {
    const id = await quiz('COURSE', course.id);
    const response = await take(student.session, id).expect(200);
    for (const key of SECRET_KEYS)
      expect(allKeys(response.body)).not.toContain(key);
  });

  it('refuses learners who may not take the quiz', async () => {
    const outsider = await t.account();
    const lessonQuiz = await quiz('LESSON', course.lessons[0]!.id);
    const chapterQuiz = await quiz('CHAPTER', course.chapterId);
    const draft = await quiz('LESSON', course.lessons[0]!.id, 'DRAFT');
    const standalone = await quiz('STANDALONE', null);

    await take(outsider.session, lessonQuiz).expect(403);
    expect(
      (await take(outsider.session, chapterQuiz).expect(403)).body.code,
    ).toBe('ENROLLMENT_REQUIRED');
    expect((await take(student.session, draft).expect(404)).body.code).toBe(
      'QUIZ_NOT_FOUND',
    );
    await take(student.session, randomUUID()).expect(404);
    expect(
      (await take(student.session, standalone).expect(403)).body.code,
    ).toBe('QUIZ_NOT_AVAILABLE');
    await t.http().get(`/quizzes/${lessonQuiz}/take`).expect(401);
  });

  it('gives the course instructor the full answer key and explanations', async () => {
    const id = await quiz('LESSON', course.lessons[0]!.id);
    const response = await manage(owner.session, id).expect(200);

    const questions = response.body as Array<{
      content: string;
      explanation: string | null;
      options: Array<{ content: string; isCorrect: boolean }>;
    }>;
    expect(questions.map((question) => question.explanation)).toEqual([
      EXPLANATION,
      EXPLANATION,
    ]);
    expect(questions[0]!.options).toEqual([
      expect.objectContaining({ content: '4', isCorrect: true }),
      expect.objectContaining({ content: '5', isCorrect: false }),
    ]);
    expect(questions[1]!.options.map((option) => option.isCorrect)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('keeps the authoring view from learners and other instructors', async () => {
    const id = await quiz('LESSON', course.lessons[0]!.id);
    const otherInstructor = await t.account('instructor');
    const admin = await t.account();
    await t.db.query(
      `INSERT INTO user_roles(user_id, role_code) VALUES ($1, 'admin')`,
      [admin.id],
    );

    await manage(student.session, id).expect(403);
    await manage(otherInstructor.session, id).expect(403);
    const asAdmin = await manage(admin.session, id).expect(200);
    expect(allKeys(asAdmin.body)).toContain('isCorrect');
  });
});
