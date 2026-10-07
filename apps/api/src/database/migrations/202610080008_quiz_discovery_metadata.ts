import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Discovery metadata for the standalone quiz hub: an optional difficulty and
 * up to 10 lowercase tags. Placement data like the title, so not frozen into
 * attempt snapshots and never used for grading.
 */
export class QuizDiscoveryMetadata1791417600008 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "QuizDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
      ALTER TABLE quizzes
        ADD COLUMN difficulty "QuizDifficulty",
        ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
        ADD CONSTRAINT "CHK_quizzes_tags" CHECK (
          cardinality(tags) <= 10 AND array_position(tags, NULL) IS NULL
        );
      CREATE INDEX "IDX_quizzes_tags" ON quizzes USING gin (tags);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "IDX_quizzes_tags";
      ALTER TABLE quizzes
        DROP CONSTRAINT "CHK_quizzes_tags",
        DROP COLUMN tags,
        DROP COLUMN difficulty;
      DROP TYPE "QuizDifficulty";
    `);
  }
}
