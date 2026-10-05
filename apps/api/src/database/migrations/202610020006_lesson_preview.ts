import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LessonPreview1790899200006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lessons
        ADD COLUMN is_preview boolean NOT NULL DEFAULT false;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE lessons DROP COLUMN is_preview');
  }
}
