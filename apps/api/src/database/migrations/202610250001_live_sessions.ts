import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C10: live classes. A session embeds a hosted stream or meeting (YouTube,
 * Vimeo, Jitsi, or an operator-approved host); nothing is streamed by us.
 *
 * - embed_url is stored already normalized to the provider's embed form.
 * - status records only what time cannot tell: CANCELLED, or ENDED early.
 *   SCHEDULED/LIVE/ENDED by the clock are derived when read.
 * - A session lasts more than nothing and at most 12 hours.
 */
export class LiveSessions1792886400001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "LiveSessionProvider" AS ENUM
        ('YOUTUBE', 'VIMEO', 'JITSI', 'CUSTOM_EMBED');
      CREATE TYPE "LiveSessionStatus" AS ENUM
        ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');
      CREATE TABLE live_sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        instructor_id uuid NOT NULL,
        title text NOT NULL,
        description text,
        start_time timestamptz NOT NULL,
        end_time timestamptz NOT NULL,
        embed_url text NOT NULL,
        provider "LiveSessionProvider" NOT NULL,
        status "LiveSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_live_sessions_title"
          CHECK (btrim(title) <> '' AND char_length(title) <= 200),
        CONSTRAINT "CHK_live_sessions_window" CHECK (
          end_time > start_time AND end_time - start_time <= interval '12 hours'),
        CONSTRAINT "CHK_live_sessions_embed_url"
          CHECK (embed_url ~ '^https://' AND char_length(embed_url) <= 2048),
        CONSTRAINT "FK_live_sessions_course"
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        CONSTRAINT "FK_live_sessions_instructor"
          FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_live_sessions_course_start"
        ON live_sessions (course_id, start_time);
      CREATE TRIGGER live_sessions_set_updated_at BEFORE UPDATE ON live_sessions
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE live_sessions;
      DROP TYPE "LiveSessionStatus";
      DROP TYPE "LiveSessionProvider";
    `);
  }
}
