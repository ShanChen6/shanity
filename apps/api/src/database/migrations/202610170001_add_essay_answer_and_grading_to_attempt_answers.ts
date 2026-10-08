import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds polymorphic Essay answers and the pending-manual-grading lifecycle.
 * Legacy SUBMITTED/TIMED_OUT rows remain valid for zero-downtime reads.
 */
export class AddEssayAnswerAndGradingToAttemptAnswers1792195200001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attempt_answers
        ADD COLUMN essay_answer jsonb,
        ADD COLUMN grading jsonb,
        ADD CONSTRAINT "CHK_attempt_answers_essay_answer_object"
          CHECK (essay_answer IS NULL OR jsonb_typeof(essay_answer) = 'object'),
        ADD CONSTRAINT "CHK_attempt_answers_grading_object"
          CHECK (grading IS NULL OR jsonb_typeof(grading) = 'object');

      ALTER TABLE quiz_attempts DROP CONSTRAINT "CHK_quiz_attempts_state";
      DROP INDEX "UQ_quiz_attempts_active";
      ALTER TABLE quiz_attempts ALTER COLUMN status DROP DEFAULT;
      ALTER TYPE "QuizAttemptStatus" RENAME TO "QuizAttemptStatus_before_essay";
      CREATE TYPE "QuizAttemptStatus" AS ENUM (
        'IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING', 'COMPLETED',
        'SUBMITTED', 'TIMED_OUT', 'ABANDONED'
      );
      ALTER TABLE quiz_attempts ALTER COLUMN status TYPE "QuizAttemptStatus"
        USING status::text::"QuizAttemptStatus";
      ALTER TABLE quiz_attempts ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
      DROP TYPE "QuizAttemptStatus_before_essay";
      CREATE UNIQUE INDEX "UQ_quiz_attempts_active"
        ON quiz_attempts(user_id, quiz_id)
        WHERE status IN ('IN_PROGRESS', 'SUBMITTING');

      ALTER TABLE quiz_attempts ADD CONSTRAINT "CHK_quiz_attempts_state" CHECK (
        (status IN ('IN_PROGRESS', 'SUBMITTING')
          AND submitted_at IS NULL AND score IS NULL AND is_passed IS NULL
          AND earned_points IS NULL AND total_points IS NULL
          AND percentage IS NULL)
        OR (status = 'NEEDS_GRADING'
          AND submitted_at IS NOT NULL AND score IS NOT NULL
          AND is_passed IS NULL AND earned_points IS NOT NULL
          AND total_points IS NOT NULL AND percentage IS NOT NULL)
        OR (status IN ('COMPLETED', 'SUBMITTED', 'TIMED_OUT')
          AND submitted_at IS NOT NULL AND score IS NOT NULL
          AND is_passed IS NOT NULL AND earned_points IS NOT NULL
          AND total_points IS NOT NULL AND percentage IS NOT NULL)
        OR (status = 'ABANDONED' AND score IS NULL AND is_passed IS NULL
          AND earned_points IS NULL AND total_points IS NULL
          AND percentage IS NULL)
      );

      CREATE OR REPLACE FUNCTION quiz_attempts_guard_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status NOT IN ('IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING') THEN
          RAISE EXCEPTION 'Quiz attempt % is closed', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_quiz_attempts_closed';
        END IF;
        IF OLD.status = 'SUBMITTING' AND NEW.status = 'IN_PROGRESS' THEN
          RAISE EXCEPTION 'Quiz attempt % is being submitted', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_quiz_attempts_submitting';
        END IF;
        IF OLD.status = 'NEEDS_GRADING'
          AND NEW.status NOT IN ('NEEDS_GRADING', 'COMPLETED') THEN
          RAISE EXCEPTION 'Quiz attempt % is awaiting grading', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_quiz_attempts_needs_grading';
        END IF;
        IF NEW.user_id <> OLD.user_id OR NEW.quiz_id <> OLD.quiz_id
          OR NEW.quiz_version <> OLD.quiz_version
          OR NEW.attempt_number <> OLD.attempt_number
          OR NEW.started_at <> OLD.started_at
          OR NEW.quiz_snapshot IS DISTINCT FROM OLD.quiz_snapshot THEN
          RAISE EXCEPTION 'Quiz attempt % snapshot is immutable', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_quiz_attempts_immutable';
        END IF;
        NEW.updated_at = clock_timestamp();
        RETURN NEW;
      END $$;

      CREATE OR REPLACE FUNCTION attempt_answers_require_open_attempt()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        attempt_status text;
      BEGIN
        SELECT status::text INTO attempt_status FROM quiz_attempts
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.attempt_id
                        ELSE NEW.attempt_id END
        FOR SHARE;
        IF FOUND AND attempt_status <> 'IN_PROGRESS' AND NOT (
          attempt_status IN ('SUBMITTING', 'NEEDS_GRADING')
          AND TG_OP = 'UPDATE'
          AND NEW.attempt_id = OLD.attempt_id
          AND NEW.question_id = OLD.question_id
          AND NEW.selected_option_ids = OLD.selected_option_ids
          AND NEW.essay_answer IS NOT DISTINCT FROM OLD.essay_answer
          AND NEW.saved_at = OLD.saved_at
        ) THEN
          RAISE EXCEPTION 'Quiz attempt is not open for this answer change'
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_attempt_answers_open_attempt';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM quiz_attempts WHERE status = 'NEEDS_GRADING'
        ) THEN
          RAISE EXCEPTION
            'Cannot revert Essay grading while attempts need grading'
            USING ERRCODE = 'integrity_constraint_violation';
        END IF;
      END $$;

      ALTER TABLE quiz_attempts DROP CONSTRAINT "CHK_quiz_attempts_state";
      ALTER TABLE quiz_attempts DISABLE TRIGGER quiz_attempts_guard_update;
      UPDATE quiz_attempts SET status = 'SUBMITTED' WHERE status = 'COMPLETED';
      ALTER TABLE quiz_attempts ENABLE TRIGGER quiz_attempts_guard_update;
      DROP INDEX "UQ_quiz_attempts_active";
      ALTER TABLE quiz_attempts ALTER COLUMN status DROP DEFAULT;
      ALTER TYPE "QuizAttemptStatus" RENAME TO "QuizAttemptStatus_with_essay";
      CREATE TYPE "QuizAttemptStatus" AS ENUM
        ('IN_PROGRESS', 'SUBMITTING', 'SUBMITTED', 'TIMED_OUT', 'ABANDONED');
      ALTER TABLE quiz_attempts ALTER COLUMN status TYPE "QuizAttemptStatus"
        USING status::text::"QuizAttemptStatus";
      ALTER TABLE quiz_attempts ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
      DROP TYPE "QuizAttemptStatus_with_essay";
      CREATE UNIQUE INDEX "UQ_quiz_attempts_active"
        ON quiz_attempts(user_id, quiz_id)
        WHERE status IN ('IN_PROGRESS', 'SUBMITTING');
      ALTER TABLE quiz_attempts ADD CONSTRAINT "CHK_quiz_attempts_state" CHECK (
        (status IN ('IN_PROGRESS', 'SUBMITTING')
          AND submitted_at IS NULL AND score IS NULL AND is_passed IS NULL
          AND earned_points IS NULL AND total_points IS NULL
          AND percentage IS NULL)
        OR (status IN ('SUBMITTED', 'TIMED_OUT')
          AND submitted_at IS NOT NULL AND score IS NOT NULL
          AND is_passed IS NOT NULL AND earned_points IS NOT NULL
          AND total_points IS NOT NULL AND percentage IS NOT NULL)
        OR (status = 'ABANDONED' AND score IS NULL AND is_passed IS NULL
          AND earned_points IS NULL AND total_points IS NULL
          AND percentage IS NULL)
      );

      CREATE OR REPLACE FUNCTION quiz_attempts_guard_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status NOT IN ('IN_PROGRESS', 'SUBMITTING') THEN
          RAISE EXCEPTION 'Quiz attempt % is closed', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_quiz_attempts_closed';
        END IF;
        IF OLD.status = 'SUBMITTING' AND NEW.status = 'IN_PROGRESS' THEN
          RAISE EXCEPTION 'Quiz attempt % is being submitted', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_quiz_attempts_submitting';
        END IF;
        IF NEW.user_id <> OLD.user_id OR NEW.quiz_id <> OLD.quiz_id
          OR NEW.quiz_version <> OLD.quiz_version
          OR NEW.attempt_number <> OLD.attempt_number
          OR NEW.started_at <> OLD.started_at
          OR NEW.quiz_snapshot IS DISTINCT FROM OLD.quiz_snapshot THEN
          RAISE EXCEPTION 'Quiz attempt % snapshot is immutable', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_quiz_attempts_immutable';
        END IF;
        NEW.updated_at = clock_timestamp();
        RETURN NEW;
      END $$;

      CREATE OR REPLACE FUNCTION attempt_answers_require_open_attempt()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        attempt_status text;
      BEGIN
        SELECT status::text INTO attempt_status FROM quiz_attempts
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.attempt_id
                        ELSE NEW.attempt_id END
        FOR SHARE;
        IF FOUND AND attempt_status <> 'IN_PROGRESS' AND NOT (
          attempt_status = 'SUBMITTING' AND TG_OP = 'UPDATE'
          AND NEW.attempt_id = OLD.attempt_id
          AND NEW.question_id = OLD.question_id
          AND NEW.selected_option_ids = OLD.selected_option_ids
          AND NEW.saved_at = OLD.saved_at
        ) THEN
          RAISE EXCEPTION 'Quiz attempt is not in progress'
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_attempt_answers_open_attempt';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;

      ALTER TABLE attempt_answers
        DROP COLUMN grading,
        DROP COLUMN essay_answer;
    `);
  }
}
