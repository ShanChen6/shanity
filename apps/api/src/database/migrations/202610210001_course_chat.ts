import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C1: Course chat schema.
 *
 * - chat_messages: one row per message in a course's group chat. Moderation
 *   moves a message between ACTIVE, HIDDEN and FLAGGED; nothing is hard
 *   deleted by the app. A message must carry text or at least one attachment.
 * - chat_reports: a learner flagging a message for moderators. One report per
 *   (message, reporter), so the same person cannot pile reports on a message.
 * - "IDX_chat_messages_course_created" (course_id, created_at, id) serves the
 *   history query: newest-first paging inside one course, with id as the
 *   keyset tie-breaker for messages sharing a timestamp.
 * - Both tables are mutable (status changes), so they carry updated_at and
 *   the generic set_updated_at() trigger.
 */
export class CourseChat1792540800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "ChatMessageStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'FLAGGED');
      CREATE TYPE "ChatReportStatus" AS ENUM ('PENDING', 'RESOLVED');

      CREATE TABLE chat_messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id uuid NOT NULL,
        sender_id uuid NOT NULL,
        content text NOT NULL DEFAULT '',
        attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
        status "ChatMessageStatus" NOT NULL DEFAULT 'ACTIVE',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_chat_messages_attachments_array"
          CHECK (jsonb_typeof(attachments) = 'array'),
        CONSTRAINT "CHK_chat_messages_not_empty"
          CHECK (btrim(content) <> '' OR jsonb_array_length(attachments) > 0),
        CONSTRAINT "FK_chat_messages_course"
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        CONSTRAINT "FK_chat_messages_sender"
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_chat_messages_course_created"
        ON chat_messages (course_id, created_at, id);
      CREATE INDEX "IDX_chat_messages_sender"
        ON chat_messages (sender_id);
      CREATE TRIGGER chat_messages_set_updated_at BEFORE UPDATE ON chat_messages
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();

      CREATE TABLE chat_reports (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        message_id uuid NOT NULL,
        reporter_id uuid NOT NULL,
        reason text NOT NULL,
        status "ChatReportStatus" NOT NULL DEFAULT 'PENDING',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_chat_reports_reason" CHECK (btrim(reason) <> ''),
        CONSTRAINT "UQ_chat_reports_message_reporter"
          UNIQUE (message_id, reporter_id),
        CONSTRAINT "FK_chat_reports_message"
          FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
        CONSTRAINT "FK_chat_reports_reporter"
          FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_chat_reports_status_created"
        ON chat_reports (status, created_at);
      CREATE INDEX "IDX_chat_reports_reporter"
        ON chat_reports (reporter_id);
      CREATE TRIGGER chat_reports_set_updated_at BEFORE UPDATE ON chat_reports
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE chat_reports;
      DROP TABLE chat_messages;
      DROP TYPE "ChatReportStatus";
      DROP TYPE "ChatMessageStatus";
    `);
  }
}
