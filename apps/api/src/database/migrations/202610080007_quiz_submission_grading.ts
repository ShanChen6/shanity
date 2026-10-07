import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Submission pipeline and official result:
 * - `SUBMITTING`, the committed intermediate state between IN_PROGRESS and
 *   SUBMITTED/TIMED_OUT that lets exactly one request grade an attempt (the
 *   enum is rebuilt: a value added by ALTER TYPE ... ADD VALUE cannot be used
 *   inside the migration transaction that adds it). It still counts as the
 *   learner's one active attempt, and only grading columns of its answers may
 *   change;
 * - the official result `earned_points`, `total_points` and `percentage`
 *   (numeric(5,2), rounded half up), backfilled for closed attempts;
 * - review policy `ALWAYS` is renamed to `AFTER_SUBMIT`.
 */
export class QuizSubmissionGrading1791417600007 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "ReviewPolicy" RENAME VALUE 'ALWAYS' TO 'AFTER_SUBMIT';

      ALTER TABLE quiz_attempts DROP CONSTRAINT "CHK_quiz_attempts_state";
      DROP INDEX "UQ_quiz_attempts_active";
      ALTER TABLE quiz_attempts ALTER COLUMN status DROP DEFAULT;
      ALTER TYPE "QuizAttemptStatus" RENAME TO "QuizAttemptStatus_old";
      CREATE TYPE "QuizAttemptStatus" AS ENUM
        ('IN_PROGRESS', 'SUBMITTING', 'SUBMITTED', 'TIMED_OUT', 'ABANDONED');
      ALTER TABLE quiz_attempts ALTER COLUMN status TYPE "QuizAttemptStatus"
        USING status::text::"QuizAttemptStatus";
      ALTER TABLE quiz_attempts ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
      DROP TYPE "QuizAttemptStatus_old";
      CREATE UNIQUE INDEX "UQ_quiz_attempts_active" ON quiz_attempts(user_id, quiz_id)
        WHERE status IN ('IN_PROGRESS', 'SUBMITTING');

      ALTER TABLE quiz_attempts
        ADD COLUMN earned_points integer,
        ADD COLUMN total_points integer,
        ADD COLUMN percentage numeric(5,2);

      -- Closed attempts are frozen by the guard trigger; backfill around it.
      ALTER TABLE quiz_attempts DISABLE TRIGGER quiz_attempts_guard_update;
      UPDATE quiz_attempts attempt SET
        earned_points = coalesce((SELECT sum(answer.points_earned)
          FROM attempt_answers answer WHERE answer.attempt_id = attempt.id), 0),
        total_points = (SELECT coalesce(sum((question->>'points')::int), 0)
          FROM jsonb_array_elements(
            coalesce(attempt.quiz_snapshot->'questions', '[]')) question)
      WHERE status IN ('SUBMITTED', 'TIMED_OUT');
      UPDATE quiz_attempts SET percentage = CASE WHEN total_points > 0
          THEN round(earned_points * 100.0 / total_points, 2) ELSE 0 END
      WHERE status IN ('SUBMITTED', 'TIMED_OUT');
      ALTER TABLE quiz_attempts ENABLE TRIGGER quiz_attempts_guard_update;

      ALTER TABLE quiz_attempts
        ADD CONSTRAINT "CHK_quiz_attempts_state" CHECK (
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
        ),
        ADD CONSTRAINT "CHK_quiz_attempts_points" CHECK (
          earned_points IS NULL
          OR (earned_points >= 0 AND earned_points <= total_points)
        ),
        ADD CONSTRAINT "CHK_quiz_attempts_percentage"
          CHECK (percentage IS NULL OR percentage BETWEEN 0 AND 100);

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

      -- While SUBMITTING, answers are frozen; only grading may annotate them.
      CREATE OR REPLACE FUNCTION attempt_answers_require_open_attempt()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        attempt_status text;
      BEGIN
        SELECT status::text INTO attempt_status FROM quiz_attempts
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.attempt_id
                        ELSE NEW.attempt_id END
        FOR SHARE;
        -- A missing attempt is either a cascade delete or an FK violation.
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
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION attempt_answers_require_open_attempt()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        attempt_status text;
      BEGIN
        SELECT status::text INTO attempt_status FROM quiz_attempts
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.attempt_id
                        ELSE NEW.attempt_id END
        FOR SHARE;
        IF FOUND AND attempt_status <> 'IN_PROGRESS' THEN
          RAISE EXCEPTION 'Quiz attempt is not in progress'
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_attempt_answers_open_attempt';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;

      CREATE OR REPLACE FUNCTION quiz_attempts_guard_update() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF OLD.status <> 'IN_PROGRESS' THEN
          RAISE EXCEPTION 'Quiz attempt % is closed', OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_quiz_attempts_closed';
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

      -- An interrupted submission goes back to running.
      ALTER TABLE quiz_attempts DISABLE TRIGGER quiz_attempts_guard_update;
      UPDATE quiz_attempts SET status = 'IN_PROGRESS' WHERE status = 'SUBMITTING';
      ALTER TABLE quiz_attempts ENABLE TRIGGER quiz_attempts_guard_update;

      ALTER TABLE quiz_attempts
        DROP CONSTRAINT "CHK_quiz_attempts_percentage",
        DROP CONSTRAINT "CHK_quiz_attempts_points",
        DROP CONSTRAINT "CHK_quiz_attempts_state",
        DROP COLUMN percentage,
        DROP COLUMN total_points,
        DROP COLUMN earned_points;

      DROP INDEX "UQ_quiz_attempts_active";
      ALTER TABLE quiz_attempts ALTER COLUMN status DROP DEFAULT;
      ALTER TYPE "QuizAttemptStatus" RENAME TO "QuizAttemptStatus_new";
      CREATE TYPE "QuizAttemptStatus" AS ENUM
        ('IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT', 'ABANDONED');
      ALTER TABLE quiz_attempts ALTER COLUMN status TYPE "QuizAttemptStatus"
        USING status::text::"QuizAttemptStatus";
      ALTER TABLE quiz_attempts ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
      DROP TYPE "QuizAttemptStatus_new";
      CREATE UNIQUE INDEX "UQ_quiz_attempts_active" ON quiz_attempts(user_id, quiz_id)
        WHERE status = 'IN_PROGRESS';
      ALTER TABLE quiz_attempts ADD CONSTRAINT "CHK_quiz_attempts_state" CHECK (
        (status = 'IN_PROGRESS'
          AND submitted_at IS NULL AND score IS NULL AND is_passed IS NULL)
        OR (status IN ('SUBMITTED', 'TIMED_OUT')
          AND submitted_at IS NOT NULL AND score IS NOT NULL
          AND is_passed IS NOT NULL)
        OR (status = 'ABANDONED' AND score IS NULL AND is_passed IS NULL)
      );

      ALTER TYPE "ReviewPolicy" RENAME VALUE 'AFTER_SUBMIT' TO 'ALWAYS';
    `);
  }
}
