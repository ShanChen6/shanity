import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LessonProgress1791244800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "LessonProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

      ALTER TABLE lesson_progress
        DROP CONSTRAINT lesson_progress_pkey,
        ADD COLUMN id uuid DEFAULT uuid_generate_v4(),
        ADD COLUMN user_id uuid,
        ADD COLUMN status "LessonProgressStatus",
        ADD COLUMN started_at timestamptz;

      UPDATE lesson_progress progress
      SET user_id = enrollment.user_id,
          status = CASE WHEN progress.completed_at IS NULL
            THEN 'IN_PROGRESS'::"LessonProgressStatus"
            ELSE 'COMPLETED'::"LessonProgressStatus" END,
          started_at = LEAST(progress.updated_at, COALESCE(progress.completed_at, progress.updated_at))
      FROM enrollments enrollment
      WHERE enrollment.id = progress.enrollment_id;

      ALTER TABLE lesson_progress
        ALTER COLUMN id SET NOT NULL,
        ALTER COLUMN user_id SET NOT NULL,
        ALTER COLUMN status SET NOT NULL,
        ALTER COLUMN status SET DEFAULT 'NOT_STARTED';
      ALTER TABLE lesson_progress RENAME COLUMN last_position_seconds TO last_position;

      ALTER TABLE lesson_progress
        ADD CONSTRAINT lesson_progress_pkey PRIMARY KEY(id),
        ADD CONSTRAINT "FK_lesson_progress_user" FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        ADD CONSTRAINT "UQ_lesson_progress_user_lesson" UNIQUE(user_id, lesson_id),
        ADD CONSTRAINT lesson_progress_last_position_check CHECK(last_position >= 0),
        ADD CONSTRAINT lesson_progress_lifecycle_check CHECK(
          (status = 'NOT_STARTED' AND started_at IS NULL AND completed_at IS NULL)
          OR (status = 'IN_PROGRESS' AND started_at IS NOT NULL AND completed_at IS NULL)
          OR (status = 'COMPLETED' AND started_at IS NOT NULL AND completed_at IS NOT NULL)
        );

      ALTER TABLE lesson_progress DROP COLUMN watched_seconds;
      CREATE INDEX lesson_progress_course_user_idx ON lesson_progress(course_id, user_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX lesson_progress_course_user_idx;
      ALTER TABLE lesson_progress
        ADD COLUMN watched_seconds integer NOT NULL DEFAULT 0 CHECK(watched_seconds >= 0),
        DROP CONSTRAINT lesson_progress_lifecycle_check,
        DROP CONSTRAINT lesson_progress_last_position_check,
        DROP CONSTRAINT "UQ_lesson_progress_user_lesson",
        DROP CONSTRAINT "FK_lesson_progress_user",
        DROP CONSTRAINT lesson_progress_pkey;
      ALTER TABLE lesson_progress RENAME COLUMN last_position TO last_position_seconds;
      ALTER TABLE lesson_progress
        ADD CONSTRAINT lesson_progress_pkey PRIMARY KEY(enrollment_id, lesson_id),
        DROP COLUMN started_at,
        DROP COLUMN status,
        DROP COLUMN user_id,
        DROP COLUMN id;
      DROP TYPE "LessonProgressStatus";
    `);
  }
}
