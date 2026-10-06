import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsRequiredToLessons1791244800002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE lessons
        ADD COLUMN is_required boolean NOT NULL DEFAULT true;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE lessons DROP COLUMN is_required`);
  }
}
