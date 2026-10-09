import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C11: heartbeat attendance for live classes.
 *
 * - live_attendances: one row per (session, student), credited only by the
 *   API from accepted heartbeats; is_attended once the credited time reaches
 *   the course's threshold of the session's scheduled length.
 * - courses.live_attendance_threshold: that threshold, in percent (50 by
 *   default).
 */
export class LiveAttendances1792972800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE courses
        ADD COLUMN live_attendance_threshold smallint NOT NULL DEFAULT 50,
        ADD CONSTRAINT "CHK_courses_live_attendance_threshold"
          CHECK (live_attendance_threshold BETWEEN 1 AND 100);

      CREATE TABLE live_attendances (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL,
        student_id uuid NOT NULL,
        duration_seconds integer NOT NULL DEFAULT 0,
        is_attended boolean NOT NULL DEFAULT false,
        first_joined_at timestamptz NOT NULL DEFAULT now(),
        last_active_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_live_attendances_session_student"
          UNIQUE (session_id, student_id),
        CONSTRAINT "CHK_live_attendances_duration" CHECK (duration_seconds >= 0),
        CONSTRAINT "CHK_live_attendances_times"
          CHECK (last_active_at >= first_joined_at),
        CONSTRAINT "FK_live_attendances_session"
          FOREIGN KEY (session_id) REFERENCES live_sessions(id) ON DELETE CASCADE,
        CONSTRAINT "FK_live_attendances_student"
          FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX "IDX_live_attendances_student" ON live_attendances (student_id);
      CREATE TRIGGER live_attendances_set_updated_at BEFORE UPDATE ON live_attendances
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE live_attendances;
      ALTER TABLE courses
        DROP CONSTRAINT "CHK_courses_live_attendance_threshold",
        DROP COLUMN live_attendance_threshold;
    `);
  }
}
