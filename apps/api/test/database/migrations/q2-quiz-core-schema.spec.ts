import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import type { DataSourceOptions } from 'typeorm';
import { afterEach, describe, expect, it } from 'vitest';
import { createAppDataSource } from '../../../src/database/typeorm.js';
import { migrateDatabase } from '../../../src/database/migrate.js';
import { revertThrough } from '../../support/migrations.js';
import {
  QuizEntity,
  QuizScope,
} from '../../../src/modules/quiz/entities/quiz.entity.js';
import { User } from '../../../src/users/user.entity.js';

const options = createAppDataSource().options;

if (typeof options.database !== 'string' || !options.database.endsWith('_test'))
  throw new Error('Use an isolated PGDATABASE ending in _test');

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
  const schema = `q2_${randomUUID().replaceAll('-', '')}`;
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
  return { admin, db, schema };
}

async function expectConstraint(
  query: Promise<unknown>,
  constraint: string,
  code = '23514',
) {
  await expect(query).rejects.toMatchObject({ code, constraint });
}

async function createUser(db: DataSource, suffix: string) {
  return db.getRepository(User).save(
    db.getRepository(User).create({
      email: `q2-${suffix}@example.invalid`,
      displayName: `Q2 ${suffix}`,
    }),
  );
}

describe('Q2 quiz core migration', () => {
  it('runs, exposes exact defaults and reverts without orphan enum types', async () => {
    const { db, schema } = await isolated();
    await migrateDatabase(db);
    const user = await createUser(db, 'defaults');

    const [quiz] = await db.query(
      `INSERT INTO quizzes(title, created_by, scope, target_id)
       VALUES ($1, $2, 'STANDALONE', NULL) RETURNING *`,
      ['Defaults', user.id],
    );
    expect(quiz).toMatchObject({
      status: 'DRAFT',
      version: 1,
      passing_score: 80,
      is_required: false,
      review_policy: 'AFTER_SUBMIT',
      grading_policy: 'HIGHEST',
      shuffle_questions: true,
      shuffle_options: true,
    });

    const indexes = (await db.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname=$1 AND tablename='quizzes'`,
      [schema],
    )) as Array<{ indexname: string; indexdef: string }>;
    expect(
      indexes.some(({ indexname }) => indexname === 'IDX_quizzes_scope_target'),
    ).toBe(true);
    expect(
      indexes.some(
        ({ indexname, indexdef }) =>
          indexname === 'UQ_quizzes_slug' &&
          indexdef.includes('WHERE (slug IS NOT NULL)'),
      ),
    ).toBe(true);

    await revertThrough(db, schema, 'QuizCoreSchema1791417600001');
    expect(
      // Schema-qualified: search_path also reaches a migrated public schema.
      (
        await db.query('SELECT to_regclass($1) AS name', [
          `"${schema}".quizzes`,
        ])
      )[0].name,
    ).toBeNull();
    for (const type of [
      'QuizScope',
      'QuizStatus',
      'ReviewPolicy',
      'GradingPolicy',
    ]) {
      expect(
        (
          await db.query('SELECT to_regtype($1) AS name', [
            `"${schema}"."${type}"`,
          ])
        )[0].name,
      ).toBeNull();
    }
  });

  it('enforces scores, limits and scope/target consistency', async () => {
    const { db } = await isolated();
    await migrateDatabase(db);
    const user = await createUser(db, 'checks');
    const insert = (
      scope: string,
      targetId: string | null,
      passingScore = 80,
    ) =>
      db.query(
        `INSERT INTO quizzes(title, created_by, scope, target_id, passing_score)
         VALUES ('Checks', $1, $2, $3, $4)`,
        [user.id, scope, targetId, passingScore],
      );

    await expectConstraint(
      insert('LESSON', randomUUID(), 120),
      'CHK_quizzes_passing_score',
    );
    await expectConstraint(
      insert('LESSON', randomUUID(), -10),
      'CHK_quizzes_passing_score',
    );
    await expectConstraint(
      insert('LESSON', null),
      'CHK_quizzes_scope_target_integrity',
    );
    await expect(insert('STANDALONE', null)).resolves.toBeDefined();
    await expectConstraint(
      db.query(
        `INSERT INTO quizzes(title,created_by,scope,target_id,max_attempts)
         VALUES ('Bad attempts',$1,'COURSE',$2,0)`,
        [user.id, randomUUID()],
      ),
      'CHK_quizzes_max_attempts',
    );
    await expectConstraint(
      db.query(
        `INSERT INTO quizzes(title,created_by,scope,target_id,duration_minutes)
         VALUES ('Bad duration',$1,'CHAPTER',$2,0)`,
        [user.id, randomUUID()],
      ),
      'CHK_quizzes_duration_minutes',
    );
  });

  it('enforces partial slug uniqueness and creator RESTRICT', async () => {
    const { db } = await isolated();
    await migrateDatabase(db);
    const user = await createUser(db, 'unique');
    const quizzes = db.getRepository(QuizEntity);

    await quizzes.save(
      quizzes.create({
        title: 'First',
        slug: 'same-slug',
        scope: QuizScope.STANDALONE,
        targetId: null,
        createdBy: user.id,
      }),
    );
    await expectConstraint(
      quizzes.insert({
        title: 'Second',
        slug: 'same-slug',
        scope: QuizScope.STANDALONE,
        targetId: null,
        createdBy: user.id,
      }),
      'UQ_quizzes_slug',
      '23505',
    );
    await expect(
      quizzes.insert({
        title: 'Null slug',
        slug: null,
        scope: QuizScope.STANDALONE,
        targetId: null,
        createdBy: user.id,
      }),
    ).resolves.toBeDefined();
    await expectConstraint(
      db.getRepository(User).delete(user.id),
      'FK_quizzes_users',
      '23503',
    );
  });
});
