import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Chapters1790899200003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
      CREATE TABLE chapters (
        id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
        course_id uuid NOT NULL,
        title varchar(255) NOT NULL,
        description text,
        position integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "FK_chapters_course"
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        CONSTRAINT chapters_position_check CHECK (position >= 0)
      );
      CREATE INDEX chapters_course_id_idx ON chapters(course_id);
      CREATE INDEX chapters_course_position_idx ON chapters(course_id, position);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE chapters');
  }
}
