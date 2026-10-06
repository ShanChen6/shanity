import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SequentialCourses1791331200001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE courses
        ADD COLUMN is_sequential boolean NOT NULL DEFAULT false;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE courses DROP COLUMN is_sequential`);
  }
}
