import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Enrollments1790899200004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE enrollments
        ALTER COLUMN id SET DEFAULT public.uuid_generate_v4(),
        DROP CONSTRAINT enrollments_user_id_fkey,
        DROP CONSTRAINT enrollments_course_id_fkey,
        ADD CONSTRAINT "FK_enrollments_user"
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        ADD CONSTRAINT "FK_enrollments_course"
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE;
      CREATE INDEX enrollments_user_idx ON enrollments(user_id);
      CREATE INDEX IF NOT EXISTS enrollments_course_idx ON enrollments(course_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX enrollments_user_idx;
      ALTER TABLE enrollments
        ALTER COLUMN id SET DEFAULT gen_random_uuid(),
        DROP CONSTRAINT "FK_enrollments_user",
        DROP CONSTRAINT "FK_enrollments_course",
        ADD CONSTRAINT enrollments_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        ADD CONSTRAINT enrollments_course_id_fkey
          FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT;
    `);
  }
}
