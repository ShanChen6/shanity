import { MigrationExecutor } from 'typeorm';
import type { DataSource, QueryRunner } from 'typeorm';
import { migrationHistory } from './migrations/index.js';

/** One connection owns the lock, history adoption and TypeORM migration runner. */
export async function migrateDatabase(
  source: DataSource,
  options: { adoptLegacy?: boolean; revert?: boolean } = {},
) {
  const runner = source.createQueryRunner();
  await runner.connect();
  let locked = false;
  try {
    // Namespace the lock by database/schema, while keeping it on this connection.
    await runner.query(
      "SELECT pg_advisory_lock(hashtextextended(current_database() || ':' || current_schema() || ':shanity-migrations', 0))",
    );
    locked = true;
    await runner.startTransaction();
    try {
      await prepareHistory(runner, options.adoptLegacy ?? false);
      await runner.commitTransaction();
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    }
    const executor = new MigrationExecutor(source, runner);
    executor.transaction = 'all';
    if (options.revert) {
      await executor.undoLastMigration();
      return [];
    }
    return await executor.executePendingMigrations();
  } finally {
    try {
      if (locked)
        await runner.query(
          "SELECT pg_advisory_unlock(hashtextextended(current_database() || ':' || current_schema() || ':shanity-migrations', 0))",
        );
    } finally {
      await runner.release();
    }
  }
}

async function prepareHistory(runner: QueryRunner, adoptLegacy: boolean) {
  await runner.query(`CREATE TABLE IF NOT EXISTS typeorm_migrations (
    id serial PRIMARY KEY, timestamp bigint NOT NULL, name varchar NOT NULL
  )`);
  const applied: { name: string; timestamp: string }[] = await runner.query(
    'SELECT name, timestamp FROM typeorm_migrations ORDER BY id',
  );
  if (
    applied.some(
      (row, i) =>
        row.name !== migrationHistory[i]?.name ||
        Number(row.timestamp) !== migrationHistory[i]?.timestamp,
    )
  ) {
    throw new Error(
      'Unknown or non-contiguous TypeORM migration history; inspect before proceeding',
    );
  }
  const [{ legacy }] = await runner.query(
    "SELECT to_regclass('knex_migrations') AS legacy",
  );
  if (!legacy) return;
  const previous: { name: string }[] = await runner.query(
    'SELECT name FROM knex_migrations ORDER BY id',
  );
  if (
    previous.some(
      (row, i) =>
        !migrationHistory[i]?.legacy ||
        row.name !== migrationHistory[i].legacy,
    )
  ) {
    throw new Error(
      'Unknown or non-contiguous Knex migration history; no schema was adopted',
    );
  }
  // Once adopted, the preserved Knex ledger is archival (including after Down).
  if (applied.length || !previous.length) return;
  if (!adoptLegacy)
    throw new Error(
      'Existing Knex history: stop old migration runners, back up, then run db:adopt-legacy',
    );
  const [{ lockTable }] = await runner.query(
    'SELECT to_regclass(\'knex_migrations_lock\') AS "lockTable"',
  );
  if (!lockTable) throw new Error('Missing legacy migration lock table');
  const locks = await runner.query(
    'SELECT is_locked FROM knex_migrations_lock',
  );
  if (locks.length !== 1 || Number(locks[0].is_locked) !== 0)
    throw new Error(
      'Legacy migrations are locked; stop the old runner before adoption',
    );
  // A known ledger is required, but is not enough if its tables/columns are absent.
  const stages: Record<string, string>[] = [
    {
      users: 'id,email,display_name,password_hash,created_at',
      auth_identities: 'id,user_id,provider,provider_subject,created_at',
      courses: 'id,slug,title,description,status,created_at',
      course_sections: 'id,course_id,title,position',
      lessons:
        'id,course_id,section_id,title,body,video_storage_key,duration_seconds,position,created_at',
      lesson_assets: 'id,lesson_id,title,storage_key,media_type,created_at',
      enrollments: 'id,user_id,course_id,enrolled_at,revoked_at',
      lesson_progress:
        'enrollment_id,lesson_id,course_id,last_position_seconds,watched_seconds,completed_at,updated_at',
    },
    {
      categories: 'id,slug,name',
      posts: 'id,author_id,slug,title,body,status,published_at,created_at',
      post_categories: 'post_id,category_id',
      chat_rooms: 'id,course_id,name,created_at',
      chat_members: 'room_id,user_id,joined_at,left_at',
      messages: 'id,room_id,sender_id,body,created_at',
    },
    {
      roles: 'code,name',
      user_roles: 'user_id,role_code,assigned_at',
      courses: 'owner_id',
      course_instructors: 'course_id,user_id,assigned_at',
    },
    {
      users: 'status',
      auth_sessions: 'id,user_id,refresh_hash,created_at,expires_at,revoked_at',
      oauth_requests:
        'state_hash,browser_hash,nonce,verifier,link_session_id,expires_at',
      auth_rate_limits: 'key,hits,expires_at',
    },
    { users: 'update_at' },
    { users: 'avatar_key' },
    {
      courses:
        'short_description,thumbnail,instructor_id,published_at,updated_at',
    },
  ];
  for (const stage of stages.slice(0, previous.length)) {
    for (const [table, columns] of Object.entries(stage)) {
      // Identifiers are exclusively the static manifest above.
      await runner.query(`SELECT ${columns} FROM ${table} LIMIT 0`);
    }
  }
  for (const entry of migrationHistory.slice(0, previous.length)) {
    await runner.query(
      'INSERT INTO typeorm_migrations(timestamp, name) VALUES ($1, $2)',
      [entry.timestamp, entry.name],
    );
  }
}
