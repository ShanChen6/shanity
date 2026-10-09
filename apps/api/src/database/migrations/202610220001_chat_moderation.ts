import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C5: Chat moderation.
 *
 * - chat_mutes: a user's right to send in one course's room, suspended until
 *   muted_until. One row per (course, user); muting again replaces the
 *   deadline (the latest moderator decision wins). Expired rows are inert.
 * - chat_moderation_logs: append-only audit of every hide, dismissal and mute
 *   (docs/permissions.md requires it for hiding content). Rows can never be
 *   updated, deleted or truncated, and what they reference cannot be deleted.
 * - chat_reports gains who resolved it and when; the CHECK keeps those two in
 *   step with status.
 */
export class ChatModeration1792627200001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE chat_mutes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        user_id uuid NOT NULL,
        muted_by uuid NOT NULL,
        muted_until timestamptz NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_chat_mutes_course_user" UNIQUE (course_id, user_id),
        CONSTRAINT "CHK_chat_mutes_reason"
          CHECK (reason IS NULL OR btrim(reason) <> ''),
        CONSTRAINT "FK_chat_mutes_course"
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        CONSTRAINT "FK_chat_mutes_user"
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT "FK_chat_mutes_muted_by"
          FOREIGN KEY (muted_by) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE TRIGGER chat_mutes_set_updated_at BEFORE UPDATE ON chat_mutes
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TYPE "ChatModerationAction"
        AS ENUM ('HIDE_MESSAGE', 'DISMISS_REPORTS', 'MUTE_USER');
      CREATE TABLE chat_moderation_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        actor_id uuid NOT NULL,
        action "ChatModerationAction" NOT NULL,
        message_id uuid,
        target_user_id uuid,
        reason text,
        -- Action-specific facts, e.g. {"mutedUntil": "..."}.
        details jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_chat_moderation_logs_target" CHECK (
          (action IN ('HIDE_MESSAGE', 'DISMISS_REPORTS')
            AND message_id IS NOT NULL)
          OR (action = 'MUTE_USER' AND target_user_id IS NOT NULL)
        ),
        CONSTRAINT "CHK_chat_moderation_logs_reason"
          CHECK (reason IS NULL OR btrim(reason) <> ''),
        CONSTRAINT "FK_chat_moderation_logs_course"
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_chat_moderation_logs_actor"
          FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_chat_moderation_logs_message"
          FOREIGN KEY (message_id) REFERENCES chat_messages(id)
          ON DELETE RESTRICT,
        CONSTRAINT "FK_chat_moderation_logs_target_user"
          FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_chat_moderation_logs_course_created"
        ON chat_moderation_logs (course_id, created_at);

      CREATE FUNCTION chat_moderation_logs_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Chat moderation records are immutable'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = 'TRG_chat_moderation_logs_immutable';
      END $$;
      CREATE TRIGGER chat_moderation_logs_immutable
        BEFORE UPDATE OR DELETE ON chat_moderation_logs
        FOR EACH ROW EXECUTE FUNCTION chat_moderation_logs_immutable();
      CREATE TRIGGER chat_moderation_logs_no_truncate
        BEFORE TRUNCATE ON chat_moderation_logs
        FOR EACH STATEMENT EXECUTE FUNCTION chat_moderation_logs_immutable();

      ALTER TABLE chat_reports
        ADD COLUMN resolved_by uuid,
        ADD COLUMN resolved_at timestamptz,
        ADD CONSTRAINT "FK_chat_reports_resolved_by"
          FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT "CHK_chat_reports_resolution" CHECK (
          (status = 'RESOLVED') = (resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
        );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM chat_moderation_logs) THEN
          RAISE EXCEPTION 'chat_moderation_logs holds audit data; refusing to drop it';
        END IF;
      END $$;
      ALTER TABLE chat_reports
        DROP CONSTRAINT "CHK_chat_reports_resolution",
        DROP CONSTRAINT "FK_chat_reports_resolved_by",
        DROP COLUMN resolved_at,
        DROP COLUMN resolved_by;
      DROP TABLE chat_moderation_logs;
      DROP FUNCTION chat_moderation_logs_immutable();
      DROP TYPE "ChatModerationAction";
      DROP TABLE chat_mutes;
    `);
  }
}
