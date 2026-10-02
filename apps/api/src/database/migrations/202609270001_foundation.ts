import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Foundation1790467200001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Intentionally fail on existing names; never silently adopt an unknown schema.
    await queryRunner.query(`
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> ''),
      display_name text NOT NULL,
      password_hash text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(email)
    );
    CREATE TABLE auth_identities (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      provider text NOT NULL,
      provider_subject text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(provider, provider_subject)
    );
    CREATE INDEX auth_identities_user_idx ON auth_identities(user_id);
    CREATE TABLE courses (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      description text NOT NULL DEFAULT '',
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE course_sections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      title text NOT NULL,
      position integer NOT NULL CHECK(position >= 0),
      UNIQUE(course_id, position),
      UNIQUE(id, course_id)
    );
    CREATE TABLE lessons (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      section_id uuid NOT NULL,
      title text NOT NULL,
      body text NOT NULL DEFAULT '',
      video_storage_key text,
      duration_seconds integer CHECK(duration_seconds >= 0),
      position integer NOT NULL CHECK(position >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(section_id, course_id) REFERENCES course_sections(id, course_id) ON DELETE RESTRICT,
      UNIQUE(section_id, position),
      UNIQUE(id, course_id)
    );
    CREATE INDEX lessons_course_idx ON lessons(course_id);
    CREATE TABLE lesson_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE RESTRICT,
      title text NOT NULL,
      storage_key text NOT NULL,
      media_type text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX lesson_assets_lesson_idx ON lesson_assets(lesson_id);
    CREATE TABLE enrollments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      enrolled_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz CHECK(revoked_at >= enrolled_at),
      UNIQUE(user_id, course_id),
      UNIQUE(id, course_id)
    );
    CREATE INDEX enrollments_course_idx ON enrollments(course_id);
    CREATE TABLE lesson_progress (
      enrollment_id uuid NOT NULL,
      lesson_id uuid NOT NULL,
      course_id uuid NOT NULL,
      last_position_seconds integer NOT NULL DEFAULT 0 CHECK(last_position_seconds >= 0),
      watched_seconds integer NOT NULL DEFAULT 0 CHECK(watched_seconds >= 0),
      completed_at timestamptz,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(enrollment_id, lesson_id),
      FOREIGN KEY(enrollment_id, course_id) REFERENCES enrollments(id, course_id) ON DELETE RESTRICT,
      FOREIGN KEY(lesson_id, course_id) REFERENCES lessons(id, course_id) ON DELETE RESTRICT
    );
    CREATE INDEX lesson_progress_lesson_idx ON lesson_progress(lesson_id, course_id);
    CREATE FUNCTION touch_lesson_progress() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
    CREATE TRIGGER lesson_progress_updated BEFORE UPDATE ON lesson_progress
      FOR EACH ROW EXECUTE FUNCTION touch_lesson_progress();
  `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Destructive rollback disabled. Restore a backup or write a reviewed forward migration.',
    );
  }
}
