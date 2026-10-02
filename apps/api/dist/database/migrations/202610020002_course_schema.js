export class CourseSchema1790899200002 {
    async up(queryRunner) {
        await queryRunner.query(`
    CREATE TYPE "CourseStatus" AS ENUM ('draft', 'review', 'published', 'hidden', 'archived');
    ALTER TABLE courses DROP CONSTRAINT courses_status_check;
    ALTER TABLE courses ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE courses ALTER COLUMN status TYPE "CourseStatus" USING status::"CourseStatus";
    ALTER TABLE courses ALTER COLUMN status SET DEFAULT 'draft';
    ALTER TABLE courses ALTER COLUMN description DROP NOT NULL;
    ALTER TABLE courses ALTER COLUMN description DROP DEFAULT;
    ALTER TABLE courses
      ADD COLUMN short_description text,
      ADD COLUMN thumbnail text,
      ADD COLUMN instructor_id uuid,
      ADD COLUMN published_at timestamptz,
      ADD COLUMN updated_at timestamptz;
    -- No historical update/publication time or primary instructor is known.
    UPDATE courses SET updated_at = created_at;
    ALTER TABLE courses ALTER COLUMN updated_at SET DEFAULT now();
    ALTER TABLE courses ALTER COLUMN updated_at SET NOT NULL;
    ALTER TABLE courses ADD CONSTRAINT "FK_courses_instructor"
      FOREIGN KEY (instructor_id) REFERENCES users(id) ON DELETE RESTRICT;
    CREATE INDEX courses_instructor_idx ON courses(instructor_id);
    CREATE INDEX courses_status_published_at_idx ON courses(status, published_at);
    CREATE FUNCTION touch_course_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
    CREATE TRIGGER courses_updated_at BEFORE UPDATE ON courses
      FOR EACH ROW EXECUTE FUNCTION touch_course_updated_at();
  `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
    DROP TRIGGER courses_updated_at ON courses;
    DROP FUNCTION touch_course_updated_at();
    DROP INDEX courses_status_published_at_idx;
    DROP INDEX courses_instructor_idx;
    ALTER TABLE courses DROP CONSTRAINT "FK_courses_instructor",
      DROP COLUMN short_description, DROP COLUMN thumbnail,
      DROP COLUMN instructor_id, DROP COLUMN published_at, DROP COLUMN updated_at;
    ALTER TABLE courses ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE courses ALTER COLUMN status TYPE text USING status::text;
    ALTER TABLE courses ALTER COLUMN status SET DEFAULT 'draft';
    ALTER TABLE courses ADD CONSTRAINT courses_status_check
      CHECK (status IN ('draft', 'review', 'published', 'hidden', 'archived'));
    DROP TYPE "CourseStatus";
    UPDATE courses SET description = '' WHERE description IS NULL;
    ALTER TABLE courses ALTER COLUMN description SET DEFAULT '';
    ALTER TABLE courses ALTER COLUMN description SET NOT NULL;
  `);
    }
}
//# sourceMappingURL=202610020002_course_schema.js.map