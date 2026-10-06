import type { MigrationInterface, QueryRunner } from 'typeorm';

/** When the quiz was last published through the publish quality gate. */
export class QuizPublishedAt1791417600006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quizzes ADD COLUMN published_at timestamptz;
      -- Best available instant for quizzes published before the gate existed.
      UPDATE quizzes SET published_at = updated_at WHERE status = 'PUBLISHED';
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE quizzes DROP COLUMN published_at;`);
  }
}
