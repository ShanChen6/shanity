import type { MigrationInterface, QueryRunner } from 'typeorm';

const GUARD = (graded: boolean) => `
  CREATE OR REPLACE FUNCTION quiz_attempts_guard_update() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.status NOT IN (
      'IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING'${graded ? ", 'GRADED'" : ''}
    ) THEN
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
      AND NEW.status NOT IN ('NEEDS_GRADING', ${graded ? "'GRADED'" : "'COMPLETED'"}) THEN
      RAISE EXCEPTION 'Quiz attempt % is awaiting grading', OLD.id
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = 'TRG_quiz_attempts_needs_grading';
    END IF;${
      graded
        ? `
    IF OLD.status = 'GRADED' AND NEW.status NOT IN ('GRADED', 'COMPLETED') THEN
      RAISE EXCEPTION 'Quiz attempt % is graded and awaits publication', OLD.id
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = 'TRG_quiz_attempts_graded';
    END IF;`
        : ''
    }
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
`;

const STATE_CHECK = (graded: boolean) => `
  ALTER TABLE quiz_attempts ADD CONSTRAINT "CHK_quiz_attempts_state" CHECK (
    (status IN ('IN_PROGRESS', 'SUBMITTING')
      AND submitted_at IS NULL AND score IS NULL AND is_passed IS NULL
      AND earned_points IS NULL AND total_points IS NULL
      AND percentage IS NULL)
    OR (status = 'NEEDS_GRADING'
      AND submitted_at IS NOT NULL AND score IS NOT NULL
      AND is_passed IS NULL AND earned_points IS NOT NULL
      AND total_points IS NOT NULL AND percentage IS NOT NULL)
    OR (status IN (${graded ? "'GRADED', " : ''}'COMPLETED', 'SUBMITTED', 'TIMED_OUT')
      AND submitted_at IS NOT NULL AND score IS NOT NULL
      AND is_passed IS NOT NULL AND earned_points IS NOT NULL
      AND total_points IS NOT NULL AND percentage IS NOT NULL)
    OR (status = 'ABANDONED' AND score IS NULL AND is_passed IS NULL
      AND earned_points IS NULL AND total_points IS NULL
      AND percentage IS NULL)
  );
`;

/**
 * Separates "graded" from "published" for essay attempts.
 *
 * - GRADED: every essay is graded and the final score is stored, but the
 *   result stays private to the instructor.
 * - COMPLETED: the result is published to the learner. `published_at` records
 *   when; it is NULL while an attempt is open, awaiting grading or GRADED.
 *
 * Attempts that need no manual grading publish themselves when they close,
 * so existing rows are backfilled with their submission time.
 */
export class AddGradedStatusAndPublishedAt1792281600001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_attempts ADD COLUMN published_at timestamptz;
      ALTER TABLE quiz_attempts DISABLE TRIGGER quiz_attempts_guard_update;
      UPDATE quiz_attempts SET published_at = coalesce(submitted_at, now())
        WHERE status IN ('COMPLETED', 'SUBMITTED', 'TIMED_OUT');
      ALTER TABLE quiz_attempts ENABLE TRIGGER quiz_attempts_guard_update;

      ALTER TABLE quiz_attempts DROP CONSTRAINT "CHK_quiz_attempts_state";
      DROP INDEX "UQ_quiz_attempts_active";
      ALTER TABLE quiz_attempts ALTER COLUMN status DROP DEFAULT;
      ALTER TYPE "QuizAttemptStatus" RENAME TO "QuizAttemptStatus_before_graded";
      CREATE TYPE "QuizAttemptStatus" AS ENUM (
        'IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING', 'GRADED', 'COMPLETED',
        'SUBMITTED', 'TIMED_OUT', 'ABANDONED'
      );
      ALTER TABLE quiz_attempts ALTER COLUMN status TYPE "QuizAttemptStatus"
        USING status::text::"QuizAttemptStatus";
      ALTER TABLE quiz_attempts ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
      DROP TYPE "QuizAttemptStatus_before_graded";
      CREATE UNIQUE INDEX "UQ_quiz_attempts_active"
        ON quiz_attempts(user_id, quiz_id)
        WHERE status IN ('IN_PROGRESS', 'SUBMITTING');

      ${STATE_CHECK(true)}
      ALTER TABLE quiz_attempts ADD CONSTRAINT "CHK_quiz_attempts_published" CHECK (
        (status = 'COMPLETED' AND published_at IS NOT NULL)
        OR (status IN ('IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING', 'GRADED')
          AND published_at IS NULL)
        OR status IN ('SUBMITTED', 'TIMED_OUT', 'ABANDONED')
      );
      ${GUARD(true)}
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE quiz_attempts DROP CONSTRAINT "CHK_quiz_attempts_published";
      ALTER TABLE quiz_attempts DROP CONSTRAINT "CHK_quiz_attempts_state";
      ALTER TABLE quiz_attempts DISABLE TRIGGER quiz_attempts_guard_update;
      -- A graded-but-unpublished attempt goes back to awaiting grading; its
      -- score is recomputed from the stored answers when it is graded again.
      UPDATE quiz_attempts SET status = 'NEEDS_GRADING', is_passed = NULL
        WHERE status = 'GRADED';
      ALTER TABLE quiz_attempts ENABLE TRIGGER quiz_attempts_guard_update;
      DROP INDEX "UQ_quiz_attempts_active";
      ALTER TABLE quiz_attempts ALTER COLUMN status DROP DEFAULT;
      ALTER TYPE "QuizAttemptStatus" RENAME TO "QuizAttemptStatus_with_graded";
      CREATE TYPE "QuizAttemptStatus" AS ENUM (
        'IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING', 'COMPLETED',
        'SUBMITTED', 'TIMED_OUT', 'ABANDONED'
      );
      ALTER TABLE quiz_attempts ALTER COLUMN status TYPE "QuizAttemptStatus"
        USING status::text::"QuizAttemptStatus";
      ALTER TABLE quiz_attempts ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
      DROP TYPE "QuizAttemptStatus_with_graded";
      CREATE UNIQUE INDEX "UQ_quiz_attempts_active"
        ON quiz_attempts(user_id, quiz_id)
        WHERE status IN ('IN_PROGRESS', 'SUBMITTING');
      ${STATE_CHECK(false)}
      ${GUARD(false)}
      ALTER TABLE quiz_attempts DROP COLUMN published_at;
    `);
  }
}
