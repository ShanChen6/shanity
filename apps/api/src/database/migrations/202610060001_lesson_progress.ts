import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LessonProgress1791244800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "ProgressStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');
      ALTER TABLE lesson_progress DROP CONSTRAINT lesson_progress_pkey;
      ALTER TABLE lesson_progress ADD COLUMN id uuid DEFAULT gen_random_uuid();
      ALTER TABLE lesson_progress ADD COLUMN user_id uuid;
      ALTER TABLE lesson_progress ADD COLUMN status "ProgressStatus";
      ALTER TABLE lesson_progress ADD COLUMN started_at timestamptz;
      ALTER TABLE lesson_progress RENAME COLUMN last_position_seconds TO last_position;
      UPDATE lesson_progress progress SET
        user_id = enrollment.user_id,
        status = CASE WHEN progress.completed_at IS NULL
          THEN 'IN_PROGRESS'::"ProgressStatus" ELSE 'COMPLETED'::"ProgressStatus" END,
        started_at = LEAST(progress.updated_at, COALESCE(progress.completed_at, progress.updated_at))
      FROM enrollments enrollment WHERE enrollment.id = progress.enrollment_id;
      ALTER TABLE lesson_progress ALTER COLUMN id SET NOT NULL;
      ALTER TABLE lesson_progress ALTER COLUMN user_id SET NOT NULL;
      ALTER TABLE lesson_progress ALTER COLUMN status SET NOT NULL;
      ALTER TABLE lesson_progress ALTER COLUMN started_at SET NOT NULL;
      ALTER TABLE lesson_progress ADD PRIMARY KEY (id);
      ALTER TABLE lesson_progress ADD CONSTRAINT lesson_progress_user_lesson_key UNIQUE(user_id, lesson_id);
      ALTER TABLE lesson_progress ADD CONSTRAINT "FK_lesson_progress_user"
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX lesson_progress_course_user_idx ON lesson_progress(course_id, user_id);
      ALTER TABLE lesson_progress DROP CONSTRAINT lesson_progress_enrollment_id_course_id_fkey;
      ALTER TABLE lesson_progress DROP COLUMN watched_seconds;
      ALTER TABLE lesson_progress DROP COLUMN enrollment_id;
      DROP TRIGGER lesson_progress_updated ON lesson_progress;
      DROP FUNCTION touch_lesson_progress();
      ALTER TABLE lesson_progress DROP COLUMN updated_at;
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'Destructive rollback disabled. Restore a backup or write a reviewed forward migration.',
    );
  }
}
