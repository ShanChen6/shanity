import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccessFoundation1790467200003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
    CREATE TABLE roles (
      code text PRIMARY KEY,
      name text NOT NULL
    );
    INSERT INTO roles(code, name) VALUES
      ('student', 'Học sinh'), ('instructor', 'Giảng viên'), ('admin', 'Quản trị viên');
    CREATE TABLE user_roles (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      role_code text NOT NULL REFERENCES roles(code) ON DELETE RESTRICT,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id, role_code)
    );
    CREATE INDEX user_roles_role_idx ON user_roles(role_code);

    -- Existing courses retain their data; ownership must be assigned explicitly.
    ALTER TABLE courses ADD COLUMN owner_id uuid REFERENCES users(id) ON DELETE RESTRICT;
    CREATE INDEX courses_owner_idx ON courses(owner_id);
    CREATE TABLE course_instructors (
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(course_id, user_id)
    );
    CREATE INDEX course_instructors_user_idx ON course_instructors(user_id);

    ALTER TABLE courses DROP CONSTRAINT courses_status_check;
    ALTER TABLE courses ADD CONSTRAINT courses_status_check
      CHECK(status IN ('draft', 'review', 'published', 'hidden', 'archived'));
    ALTER TABLE posts DROP CONSTRAINT posts_status_check;
    ALTER TABLE posts ADD CONSTRAINT posts_status_check
      CHECK(status IN ('draft', 'review', 'published', 'hidden', 'archived'));
  `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error(
      'Destructive rollback disabled. Use a reviewed forward migration.',
    );
  }
}
