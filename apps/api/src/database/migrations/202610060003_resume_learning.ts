import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ResumeLearning1791244800003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE enrollments
        ADD COLUMN last_accessed_lesson_id uuid NULL,
        ADD COLUMN last_accessed_at timestamptz NULL,
        ADD CONSTRAINT "FK_enrollments_last_accessed_lesson"
          FOREIGN KEY (last_accessed_lesson_id) REFERENCES lessons(id)
          ON DELETE SET NULL;
      CREATE INDEX idx_enrollments_user_last_accessed
        ON enrollments(user_id, last_accessed_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX idx_enrollments_user_last_accessed;
      ALTER TABLE enrollments
        DROP CONSTRAINT "FK_enrollments_last_accessed_lesson",
        DROP COLUMN last_accessed_at,
        DROP COLUMN last_accessed_lesson_id;
    `);
  }
}
