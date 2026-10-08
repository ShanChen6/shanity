import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pre-release schema alignment (audit findings, no behaviour change):
 *
 * 1. users.update_at -> updated_at, so every table spells its audit columns
 *    the same way. The trigger function is renamed with it.
 * 2. Audit columns the mutable tables were missing: quiz_options.updated_at,
 *    enrollments.updated_at, attempt_answers.created_at. A single generic
 *    trigger function keeps updated_at honest for ORM and raw SQL alike.
 * 3. order_audit_logs.actor_id now references users (it was the one
 *    user-reference column without a foreign key). Validation fails loudly if
 *    a historical row points at a missing user.
 * 4. Composite indexes for the hot read paths, each matched to a real query:
 *    - orders (user_id, created_at DESC)         student order history
 *    - orders (status, created_at DESC)          admin list filtered by status
 *    - quiz_attempts (quiz_id, status)           grading queue / publish-results
 *    - quiz_attempts (user_id, started_at DESC)  "my attempts" page
 *    - quizzes (created_by, updated_at DESC)     instructor quiz list
 */
export class PreReleaseSchemaAlignment1792454400001
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- 1. users audit column spelling
      ALTER TABLE users RENAME COLUMN update_at TO updated_at;
      CREATE FUNCTION touch_user_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
      DROP TRIGGER users_update_at ON users;
      CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION touch_user_updated_at();
      DROP FUNCTION touch_user_update_at();

      -- 2. missing audit columns
      CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;

      ALTER TABLE quiz_options
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
      UPDATE quiz_options SET updated_at = created_at;
      CREATE TRIGGER quiz_options_set_updated_at BEFORE UPDATE ON quiz_options
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      ALTER TABLE enrollments
        ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
      UPDATE enrollments SET updated_at = enrolled_at;
      CREATE TRIGGER enrollments_set_updated_at BEFORE UPDATE ON enrollments
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      -- Existing answers have no better creation time than their last save.
      -- The open-attempt guard rejects every UPDATE on closed attempts, so it
      -- is paused for this one backfill (same transaction; a failure rolls
      -- the whole migration back, guard included).
      ALTER TABLE attempt_answers ADD COLUMN created_at timestamptz;
      ALTER TABLE attempt_answers
        DISABLE TRIGGER attempt_answers_require_open_attempt;
      UPDATE attempt_answers SET created_at = saved_at;
      ALTER TABLE attempt_answers
        ENABLE TRIGGER attempt_answers_require_open_attempt;
      ALTER TABLE attempt_answers
        ALTER COLUMN created_at SET DEFAULT now(),
        ALTER COLUMN created_at SET NOT NULL;

      -- 3. the one user reference without a foreign key
      ALTER TABLE order_audit_logs
        ADD CONSTRAINT "FK_order_audit_logs_actor"
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT NOT VALID;
      ALTER TABLE order_audit_logs VALIDATE CONSTRAINT "FK_order_audit_logs_actor";

      -- 4. composite indexes for hot reads
      CREATE INDEX IF NOT EXISTS "IDX_orders_user_created"
        ON orders (user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS "IDX_orders_status_created"
        ON orders (status, created_at DESC);
      CREATE INDEX IF NOT EXISTS "IDX_quiz_attempts_quiz_status"
        ON quiz_attempts (quiz_id, status);
      CREATE INDEX IF NOT EXISTS "IDX_quiz_attempts_user_started"
        ON quiz_attempts (user_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS "IDX_quizzes_creator_updated"
        ON quizzes (created_by, updated_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_quizzes_creator_updated";
      DROP INDEX "IDX_quiz_attempts_user_started";
      DROP INDEX "IDX_quiz_attempts_quiz_status";
      DROP INDEX "IDX_orders_status_created";
      DROP INDEX "IDX_orders_user_created";

      ALTER TABLE order_audit_logs DROP CONSTRAINT "FK_order_audit_logs_actor";

      ALTER TABLE attempt_answers DROP COLUMN created_at;
      DROP TRIGGER enrollments_set_updated_at ON enrollments;
      ALTER TABLE enrollments DROP COLUMN updated_at;
      DROP TRIGGER quiz_options_set_updated_at ON quiz_options;
      ALTER TABLE quiz_options DROP COLUMN updated_at;
      DROP FUNCTION set_updated_at();

      CREATE FUNCTION touch_user_update_at() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.update_at = clock_timestamp(); RETURN NEW; END $$;
      DROP TRIGGER users_updated_at ON users;
      ALTER TABLE users RENAME COLUMN updated_at TO update_at;
      CREATE TRIGGER users_update_at BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION touch_user_update_at();
      DROP FUNCTION touch_user_updated_at();
    `);
  }
}
