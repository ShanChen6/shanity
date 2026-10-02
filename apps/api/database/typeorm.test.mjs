import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { DataSource } from 'typeorm';
import { createAppDataSource } from '../dist/database/typeorm.js';
import { migrateDatabase } from '../dist/database/migrate.js';
import {
  migrationHistory,
  migrations,
} from '../dist/database/migrations/index.js';
import { Course } from '../dist/courses/course.entity.js';
import { User } from '../dist/users/user.entity.js';
import { CourseStatus } from '../dist/courses/course-status.js';
import { seed as seedDemo } from './seeds/001_demo.mjs';
import { seed as seedAdmin } from './seeds/002_super_admin.mjs';

const options = createAppDataSource().options;
if (!options.database.endsWith('_test'))
  throw new Error('Use an isolated PGDATABASE ending in _test');

async function isolated(run) {
  const schema = `orm_${randomUUID().replaceAll('-', '')}`;
  const admin = await new DataSource(options).initialize();
  let db;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({
      ...options,
      schema,
      extra: {
        ...options.extra,
        options: `-c timezone=UTC -c search_path=${schema}`,
      },
    }).initialize();
    await run(db, schema);
  } finally {
    if (db?.isInitialized) await db.destroy();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.destroy();
  }
}
const rejectsCode = (query, code, constraint) =>
  assert.rejects(
    query,
    (error) =>
      error.code === code && (!constraint || error.constraint === constraint),
  );

async function legacy(db, count = 6) {
  // Frozen pre-TypeORM SQL, independent of the migrated TypeScript classes.
  await db.query(
    await readFile(
      new URL('./fixtures/legacy-schema.sql', import.meta.url),
      'utf8',
    ),
  );
  if (count === 7) {
    const runner = db.createQueryRunner();
    try {
      await new migrations[6]().up(runner);
    } finally {
      await runner.release();
    }
  }
  await db.query(
    'CREATE TABLE knex_migrations(id serial PRIMARY KEY, name varchar(255), batch integer, migration_time timestamptz)',
  );
  await db.query(
    'CREATE TABLE knex_migrations_lock("index" serial PRIMARY KEY, is_locked integer)',
  );
  await db.query('INSERT INTO knex_migrations_lock(is_locked) VALUES (0)');
  for (const entry of migrationHistory.slice(0, count)) {
    await db.query(
      'INSERT INTO knex_migrations(name,batch,migration_time) VALUES ($1,1,now())',
      [entry.legacy],
    );
  }
}

test('fresh database: all migrations, concurrent runner, repeat and safe baseline revert', async () =>
  isolated(async (db) => {
    const completed = await Promise.all([
      migrateDatabase(db),
      migrateDatabase(db),
    ]);
    assert.equal(completed.flat().length, 7);
    assert.deepEqual(await migrateDatabase(db), []);
    assert.equal(
      (await db.query('SELECT * FROM typeorm_migrations')).length,
      7,
    );
    await migrateDatabase(db, { revert: true });
    await assert.rejects(
      () => migrateDatabase(db, { revert: true }),
      /Destructive rollback disabled/,
    );
    assert.equal(
      (await db.query('SELECT * FROM typeorm_migrations')).length,
      6,
    );
    assert.equal((await migrateDatabase(db)).length, 1);
  }));

test('legacy adoption: explicit, contiguous, unlocked history required; rejected adoption is atomic', async () =>
  isolated(async (db) => {
    await legacy(db);
    await assert.rejects(() => migrateDatabase(db), /db:adopt-legacy/);
    await db.query('UPDATE knex_migrations_lock SET is_locked=1');
    await assert.rejects(
      () => migrateDatabase(db, { adoptLegacy: true }),
      /locked/,
    );
    await db.query('UPDATE knex_migrations_lock SET is_locked=0');
    await db.query("UPDATE knex_migrations SET name='unknown.mjs' WHERE id=2");
    await assert.rejects(
      () => migrateDatabase(db, { adoptLegacy: true }),
      /Unknown or non-contiguous/,
    );
    assert.equal(
      (await db.query("SELECT to_regclass('typeorm_migrations') AS name"))[0]
        .name,
      null,
    );
    await db.query('UPDATE knex_migrations SET name=$1 WHERE id=2', [
      migrationHistory[1].legacy,
    ]);
    await db.query('ALTER TABLE users RENAME COLUMN avatar_key TO missing_avatar_key');
    await assert.rejects(() => migrateDatabase(db, { adoptLegacy: true }), /avatar_key/);
    assert.equal((await db.query("SELECT to_regclass('typeorm_migrations') AS name"))[0].name, null);
    await db.query('ALTER TABLE users RENAME COLUMN missing_avatar_key TO avatar_key');
    assert.equal((await migrateDatabase(db, { adoptLegacy: true })).length, 1);
    assert.deepEqual(await migrateDatabase(db), []);
  }));

test('C2 legacy upgrade: data/constraints, real repositories, Down/Up', async () =>
  isolated(async (db, schema) => {
    await legacy(db);
    const [user] = await db.query(
      "INSERT INTO users(email,display_name,password_hash) VALUES ('c2@example.invalid','Instructor','private-hash') RETURNING *",
    );
    await db.query("INSERT INTO user_roles(user_id,role_code) VALUES ($1,'student')", [user.id]);
    await db.query("INSERT INTO auth_sessions(user_id,refresh_hash,expires_at) VALUES ($1,'existing-refresh-hash',now()+interval '1 day')", [user.id]);
    await db.query("INSERT INTO auth_identities(user_id,provider,provider_subject) VALUES ($1,'google','existing-subject')", [user.id]);
    const authSnapshot = async () => Promise.all(['users','user_roles','auth_sessions','auth_identities'].map(table => db.query(`SELECT * FROM ${table}`)));
    const authBefore = await authSnapshot();
    const statuses = Object.values(CourseStatus);
    const existing = [];
    for (const status of statuses) {
      existing.push(
        (
          await db.query(
            "INSERT INTO courses(title,slug,status,owner_id,created_at) VALUES ($1,$1,$1,$2,'2025-01-01T00:00:00Z') RETURNING *",
            [status, user.id],
          )
        )[0],
      );
    }
    await db.query(
      "INSERT INTO course_sections(course_id,title,position) VALUES ($1,'Existing section',0)",
      [existing[0].id],
    );
    await db.query(
      'INSERT INTO course_instructors(course_id,user_id) VALUES ($1,$2)',
      [existing[0].id, user.id],
    );
    await migrateDatabase(db, { adoptLegacy: true });
    assert.deepEqual(await authSnapshot(), authBefore);
    const rows = await db.query('SELECT * FROM courses ORDER BY slug');
    assert.deepEqual(
      rows.map((row) => row.status),
      [...statuses].sort(),
    );
    for (const row of rows) {
      assert.equal(row.owner_id, user.id);
      assert.equal(row.instructor_id, null);
      assert.equal(row.published_at, null);
      assert.equal(row.updated_at.toISOString(), row.created_at.toISOString());
    }
    const columns = await db.query(
      "SELECT * FROM information_schema.columns WHERE table_schema=$1 AND table_name='courses'",
      [schema],
    );
    for (const name of ['published_at', 'created_at', 'updated_at'])
      assert.equal(
        columns.find((c) => c.column_name === name).data_type,
        'timestamp with time zone',
      );
    assert.equal(
      columns.find((c) => c.column_name === 'status').udt_name,
      'CourseStatus',
    );
    const indexes = await db.query(
      "SELECT * FROM pg_indexes WHERE schemaname=$1 AND tablename='courses'",
      [schema],
    );
    assert.ok(indexes.some((i) => /UNIQUE.*\(slug\)/.test(i.indexdef)));
    assert.ok(indexes.some((i) => /\(instructor_id\)/.test(i.indexdef)));
    assert.ok(indexes.some((i) => /\(status, published_at\)/.test(i.indexdef)));
    const instructor = await db
      .getRepository(User)
      .findOneByOrFail({ id: user.id });
    assert.equal(instructor.passwordHash, undefined);
    const courses = db.getRepository(Course);
    const created = await courses.save(
      courses.create({ title: 'New', slug: 'new', instructor }),
    );
    const loaded = await courses.findOneOrFail({
      where: { id: created.id },
      relations: { instructor: true },
    });
    assert.equal(loaded.instructor.id, user.id);
    assert.equal(loaded.status, CourseStatus.DRAFT);
    for (const key of [
      'description',
      'shortDescription',
      'thumbnail',
      'publishedAt',
    ])
      assert.equal(loaded[key], null);
    assert.ok(loaded.createdAt instanceof Date);
    await courses.update(created.id, {
      status: CourseStatus.PUBLISHED,
      publishedAt: new Date(),
      shortDescription: 'Short',
      thumbnail: 'course.webp',
    });
    assert.ok(
      (await courses.findOneByOrFail({ id: created.id })).updatedAt >
        loaded.updatedAt,
    );
    await rejectsCode(
      () => courses.insert({ title: 'Duplicate', slug: 'new' }),
      '23505',
    );
    await rejectsCode(
      () => db.query("INSERT INTO courses(slug) VALUES ('no-title')"),
      '23502',
    );
    await rejectsCode(
      () => db.query("INSERT INTO courses(title) VALUES ('No slug')"),
      '23502',
    );
    await rejectsCode(
      () =>
        db.query("UPDATE courses SET status='unknown' WHERE id=$1", [
          created.id,
        ]),
      '22P02',
    );
    await rejectsCode(
      () => courses.update(created.id, { instructorId: randomUUID() }),
      '23503',
      'FK_courses_instructor',
    );
    const [only] = await db.query(
      "INSERT INTO users(email,display_name) VALUES ('only@example.invalid','Only instructor') RETURNING id",
    );
    await courses.update(created.id, { instructorId: only.id });
    await rejectsCode(
      () => db.getRepository(User).delete(only.id),
      '23503',
      'FK_courses_instructor',
    );
    await migrateDatabase(db, { revert: true });
    assert.equal(
      (await db.query('SELECT * FROM courses WHERE id=$1', [created.id]))[0]
        .description,
      '',
    );
    assert.equal(
      (await db.query('SELECT * FROM courses')).length,
      statuses.length + 1,
    );
    assert.equal((await db.query('SELECT * FROM course_sections')).length, 1);
    assert.equal(
      (await db.query('SELECT * FROM course_instructors')).length,
      1,
    );
    assert.equal(
      (await db.query('SELECT to_regtype(\'"CourseStatus"\') AS name'))[0].name,
      null,
    );
    await rejectsCode(
      () =>
        db.query("UPDATE courses SET status='unknown' WHERE id=$1", [
          created.id,
        ]),
      '23514',
    );
    assert.equal((await migrateDatabase(db)).length, 1);
  }));

test('already-applied C2 is adopted without replaying SQL', async () =>
  isolated(async (db) => {
    await legacy(db, 7);
    await db.query(
      "INSERT INTO courses(title,slug,short_description) VALUES ('Keep','keep','Preserved')",
    );
    assert.deepEqual(await migrateDatabase(db, { adoptLegacy: true }), []);
    assert.equal(
      (
        await db.query(
          "SELECT short_description FROM courses WHERE slug='keep'",
        )
      )[0].short_description,
      'Preserved',
    );
    await migrateDatabase(db, { revert: true });
    assert.equal((await migrateDatabase(db)).length, 1);
  }));

test('seeds are idempotent and do not reset an existing administrator password', async () =>
  isolated(async (db) => {
    await migrateDatabase(db);
    const keys = [
      'NODE_ENV',
      'SUPER_ADMIN_EMAIL',
      'SUPER_ADMIN_PASSWORD',
      'SUPER_ADMIN_NAME',
    ];
    const previous = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    try {
      Object.assign(process.env, {
        NODE_ENV: 'development',
        SUPER_ADMIN_EMAIL: 'admin@example.invalid',
        SUPER_ADMIN_PASSWORD: 'Test-only-password-42',
        SUPER_ADMIN_NAME: 'Test Admin',
      });
      await seedDemo(db);
      await seedAdmin(db);
      const [before] = await db.query(
        "SELECT * FROM users WHERE email='admin@example.invalid'",
      );
      process.env.SUPER_ADMIN_PASSWORD = 'Different-test-password-42';
      await seedDemo(db);
      await seedAdmin(db);
      const [after] = await db.query(
        "SELECT * FROM users WHERE email='admin@example.invalid'",
      );
      assert.equal(after.password_hash, before.password_hash);
      assert.equal((await db.query('SELECT * FROM users')).length, 1);
      assert.equal((await db.query('SELECT * FROM user_roles')).length, 1);
      assert.equal((await db.query('SELECT * FROM courses')).length, 1);
      assert.equal((await db.query('SELECT * FROM lessons')).length, 1);
    } finally {
      for (const key of keys)
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
    }
  }));
