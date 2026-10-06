export class LessonProgress1791244800001 {
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TYPE "LessonProgressStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
      ALTER TABLE lesson_progress
        DROP CONSTRAINT lesson_progress_pkey,
        DROP CONSTRAINT lesson_progress_enrollment_id_course_id_fkey,
        DROP CONSTRAINT lesson_progress_lesson_id_course_id_fkey;
      ALTER TABLE lesson_progress RENAME COLUMN last_position_seconds TO last_position;
      ALTER TABLE lesson_progress
        ADD COLUMN id uuid DEFAULT public.uuid_generate_v4(),
        ADD COLUMN user_id uuid,
        ADD COLUMN status "LessonProgressStatus" NOT NULL DEFAULT 'IN_PROGRESS',
        ADD COLUMN started_at timestamptz,
        ADD COLUMN last_accessed_at timestamptz,
        ADD COLUMN created_at timestamptz;
      UPDATE lesson_progress progress SET
        user_id = enrollment.user_id,
        status = CASE WHEN progress.completed_at IS NULL
          THEN 'IN_PROGRESS'::"LessonProgressStatus"
          ELSE 'COMPLETED'::"LessonProgressStatus" END,
        started_at = LEAST(progress.updated_at, COALESCE(progress.completed_at, progress.updated_at)),
        last_accessed_at = progress.updated_at,
        created_at = LEAST(progress.updated_at, COALESCE(progress.completed_at, progress.updated_at))
      FROM enrollments enrollment WHERE enrollment.id = progress.enrollment_id;
      ALTER TABLE lesson_progress
        ALTER COLUMN id SET NOT NULL,
        ALTER COLUMN user_id SET NOT NULL,
        ALTER COLUMN started_at SET DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN started_at SET NOT NULL,
        ALTER COLUMN last_accessed_at SET DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN last_accessed_at SET NOT NULL,
        ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN created_at SET NOT NULL,
        ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN last_position DROP NOT NULL,
        ALTER COLUMN last_position SET DEFAULT 0,
        ADD CONSTRAINT "PK_lesson_progress" PRIMARY KEY (id),
        ADD CONSTRAINT "UQ_lesson_progress_user_lesson" UNIQUE (user_id, lesson_id),
        ADD CONSTRAINT "FK_lesson_progress_user" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        ADD CONSTRAINT "FK_lesson_progress_lesson" FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
        ADD CONSTRAINT "FK_lesson_progress_course" FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        ADD CONSTRAINT "FK_lesson_progress_lesson_course" FOREIGN KEY (lesson_id, course_id)
          REFERENCES lessons(id, course_id) ON DELETE CASCADE;
      CREATE INDEX idx_lesson_progress_user_course ON lesson_progress(user_id, course_id);
      CREATE INDEX idx_lesson_progress_user_lesson ON lesson_progress(user_id, lesson_id);
      CREATE INDEX idx_lesson_progress_completed ON lesson_progress(user_id, course_id, status);
      ALTER TABLE lesson_progress DROP COLUMN watched_seconds, DROP COLUMN enrollment_id;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      DROP INDEX idx_lesson_progress_completed;
      DROP INDEX idx_lesson_progress_user_lesson;
      DROP INDEX idx_lesson_progress_user_course;
      ALTER TABLE lesson_progress
        DROP CONSTRAINT "FK_lesson_progress_lesson_course",
        DROP CONSTRAINT "FK_lesson_progress_course",
        DROP CONSTRAINT "FK_lesson_progress_lesson",
        DROP CONSTRAINT "FK_lesson_progress_user",
        DROP CONSTRAINT "UQ_lesson_progress_user_lesson",
        DROP CONSTRAINT "PK_lesson_progress",
        ADD COLUMN enrollment_id uuid,
        ADD COLUMN watched_seconds integer NOT NULL DEFAULT 0;
      UPDATE lesson_progress progress SET enrollment_id = enrollment.id
      FROM enrollments enrollment
      WHERE enrollment.user_id = progress.user_id AND enrollment.course_id = progress.course_id;
      ALTER TABLE lesson_progress
        ALTER COLUMN enrollment_id SET NOT NULL,
        ALTER COLUMN last_position SET NOT NULL,
        ADD CONSTRAINT lesson_progress_pkey PRIMARY KEY (enrollment_id, lesson_id),
        ADD CONSTRAINT lesson_progress_enrollment_id_course_id_fkey
          FOREIGN KEY (enrollment_id, course_id) REFERENCES enrollments(id, course_id) ON DELETE RESTRICT,
        ADD CONSTRAINT lesson_progress_lesson_id_course_id_fkey
          FOREIGN KEY (lesson_id, course_id) REFERENCES lessons(id, course_id) ON DELETE RESTRICT,
        DROP COLUMN id, DROP COLUMN user_id, DROP COLUMN status,
        DROP COLUMN started_at, DROP COLUMN last_accessed_at, DROP COLUMN created_at;
      ALTER TABLE lesson_progress RENAME COLUMN last_position TO last_position_seconds;
      DROP TYPE "LessonProgressStatus";
    `);
    }
}
//# sourceMappingURL=202610060001_lesson_progress.js.map