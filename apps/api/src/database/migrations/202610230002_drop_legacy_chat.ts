import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The foundation's chat tables (chat_rooms, chat_members, messages) were
 * never used: course chat lives in chat_messages (C1), where membership is
 * the course enrollment itself rather than a separate member list. They go,
 * but only while empty: a database where someone did use them refuses the
 * migration instead of losing those rows.
 */
export class DropLegacyChat1792713600002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM messages)
          OR EXISTS (SELECT 1 FROM chat_members)
          OR EXISTS (SELECT 1 FROM chat_rooms) THEN
          RAISE EXCEPTION 'Legacy chat tables hold data; migrate it before dropping them';
        END IF;
      END $$;
      DROP TABLE messages;
      DROP TABLE chat_members;
      DROP TABLE chat_rooms;
    `);
  }

  /** Recreates the foundation's definitions exactly (empty). */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE chat_rooms (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX chat_rooms_course_idx ON chat_rooms(course_id);
      CREATE TABLE chat_members (
        room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE RESTRICT,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        joined_at timestamptz NOT NULL DEFAULT now(),
        left_at timestamptz CHECK(left_at >= joined_at),
        PRIMARY KEY(room_id, user_id)
      );
      CREATE INDEX chat_members_user_idx ON chat_members(user_id);
      CREATE TABLE messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        room_id uuid NOT NULL,
        sender_id uuid NOT NULL,
        body text NOT NULL CHECK(length(btrim(body)) > 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY(room_id, sender_id) REFERENCES chat_members(room_id, user_id) ON DELETE RESTRICT
      );
      CREATE INDEX messages_history_idx ON messages(room_id, created_at DESC, id);
      CREATE INDEX messages_sender_idx ON messages(room_id, sender_id);
    `);
  }
}
