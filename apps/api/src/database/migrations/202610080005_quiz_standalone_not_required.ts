import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A STANDALONE quiz gates no course, so it can never be required. The API
 * rejects it with STANDALONE_QUIZ_CANNOT_BE_REQUIRED; this is the backstop.
 */
export class QuizStandaloneNotRequired1791417600005 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- The flag was meaningless on standalone quizzes; clear it before enforcing.
      UPDATE quizzes SET is_required = false
      WHERE scope = 'STANDALONE' AND is_required;
      ALTER TABLE quizzes ADD CONSTRAINT "CHK_quizzes_standalone_not_required"
        CHECK (scope <> 'STANDALONE' OR NOT is_required);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quizzes DROP CONSTRAINT "CHK_quizzes_standalone_not_required";
    `);
  }
}
