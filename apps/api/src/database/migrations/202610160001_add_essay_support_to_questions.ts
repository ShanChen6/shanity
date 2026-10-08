import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive Sprint 9 extension of the Sprint 7 question table.
 *
 * ALTER TYPE only makes the new value available after this transaction commits;
 * this migration deliberately does not insert or update an ESSAY row.
 */
export class AddEssaySupportToQuestions1792108800001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "QuizQuestionType" ADD VALUE IF NOT EXISTS 'ESSAY';

      ALTER TABLE quiz_questions
        ADD COLUMN essay_config jsonb;

      ALTER TABLE quiz_questions
        ADD CONSTRAINT "CHK_quiz_questions_essay_config_object"
        CHECK (essay_config IS NULL OR jsonb_typeof(essay_config) = 'object');
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM quiz_questions WHERE type::text = 'ESSAY') THEN
          RAISE EXCEPTION
            'Cannot revert essay support while ESSAY questions exist'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
      END $$;

      ALTER TABLE quiz_questions DROP COLUMN essay_config;

      ALTER TABLE quiz_questions ALTER COLUMN type DROP DEFAULT;
      ALTER TYPE "QuizQuestionType" RENAME TO "QuizQuestionType_with_essay";
      CREATE TYPE "QuizQuestionType" AS ENUM
        ('SINGLE_CHOICE', 'MULTIPLE_CHOICE');
      ALTER TABLE quiz_questions ALTER COLUMN type TYPE "QuizQuestionType"
        USING type::text::"QuizQuestionType";
      ALTER TABLE quiz_questions ALTER COLUMN type SET DEFAULT 'SINGLE_CHOICE';
      DROP TYPE "QuizQuestionType_with_essay";
    `);
  }
}
