import type { MigrationInterface, QueryRunner } from 'typeorm';

/** The attempt guard as of E14 (GRADED/COMPLETED were then not adjustable). */
const GUARD_BEFORE = `
  CREATE OR REPLACE FUNCTION quiz_attempts_guard_update() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.status NOT IN (
      'IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING', 'GRADED'
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
      AND NEW.status NOT IN ('NEEDS_GRADING', 'GRADED') THEN
      RAISE EXCEPTION 'Quiz attempt % is awaiting grading', OLD.id
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = 'TRG_quiz_attempts_needs_grading';
    END IF;
    IF OLD.status = 'GRADED' AND NEW.status NOT IN ('GRADED', 'COMPLETED') THEN
      RAISE EXCEPTION 'Quiz attempt % is graded and awaits publication', OLD.id
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = 'TRG_quiz_attempts_graded';
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
`;

/**
 * As of E15 a graded or published attempt can be re-scored (grade
 * adjustment), but only in place: its status, submission time and
 * publication time stay put.
 */
const GUARD_AFTER = `
  CREATE OR REPLACE FUNCTION quiz_attempts_guard_update() RETURNS trigger
  LANGUAGE plpgsql AS $$
  BEGIN
    IF OLD.status NOT IN (
      'IN_PROGRESS', 'SUBMITTING', 'NEEDS_GRADING', 'GRADED', 'COMPLETED'
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
      AND NEW.status NOT IN ('NEEDS_GRADING', 'GRADED') THEN
      RAISE EXCEPTION 'Quiz attempt % is awaiting grading', OLD.id
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = 'TRG_quiz_attempts_needs_grading';
    END IF;
    IF OLD.status = 'GRADED' AND NEW.status NOT IN ('GRADED', 'COMPLETED') THEN
      RAISE EXCEPTION 'Quiz attempt % is graded and awaits publication', OLD.id
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = 'TRG_quiz_attempts_graded';
    END IF;
    IF OLD.status = 'COMPLETED'
      AND (NEW.status <> 'COMPLETED'
        OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
        OR NEW.published_at IS DISTINCT FROM OLD.published_at) THEN
      RAISE EXCEPTION 'Quiz attempt % is published and final', OLD.id
        USING ERRCODE = 'integrity_constraint_violation',
          CONSTRAINT = 'TRG_quiz_attempts_published';
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
`;

const ANSWERS_GUARD = (statuses: string) => `
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
      attempt_status IN (${statuses})
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
`;

/**
 * Grade Adjustment Audit Trail.
 *
 * - `quiz_grade_audit_logs` records every change to an essay grade that was
 *   already given (who, when, old/new points, feedback and rubric, reason).
 *   Rows can never be updated, deleted or truncated, and the rows they
 *   reference cannot be deleted either.
 * - `question_id` carries no FK, like `attempt_answers.question_id`: it is a
 *   snapshot identity, and the authoring row may be edited or removed.
 * - `was_published` + the reason CHECK make "adjusting a published attempt
 *   needs a reason" a database rule, not only a service one.
 * - Graded and published attempts may now be re-scored in place (status,
 *   submission and publication time stay fixed), and only the grading columns
 *   of their answers may change.
 */
export class AddQuizGradeAuditLogs1792368000001 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE quiz_grade_audit_logs (
        id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
        quiz_answer_id uuid NOT NULL,
        attempt_id uuid NOT NULL,
        -- Snapshot identity, deliberately without an FK to authoring rows.
        question_id uuid NOT NULL,
        adjusted_by uuid NOT NULL,
        old_score numeric(7,2) NOT NULL,
        new_score numeric(7,2) NOT NULL,
        old_feedback text,
        new_feedback text,
        old_rubric_scores jsonb,
        new_rubric_scores jsonb,
        adjustment_reason text,
        -- Whether the learner could already see the result.
        was_published boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_quiz_grade_audit_logs_scores"
          CHECK (old_score >= 0 AND new_score >= 0),
        CONSTRAINT "CHK_quiz_grade_audit_logs_reason"
          CHECK (adjustment_reason IS NULL OR btrim(adjustment_reason) <> ''),
        CONSTRAINT "CHK_quiz_grade_audit_logs_published_reason"
          CHECK (NOT was_published OR adjustment_reason IS NOT NULL),
        CONSTRAINT "FK_quiz_grade_audit_logs_attempt_answers"
          FOREIGN KEY (quiz_answer_id) REFERENCES attempt_answers(id)
          ON DELETE RESTRICT,
        CONSTRAINT "FK_quiz_grade_audit_logs_quiz_attempts"
          FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id)
          ON DELETE RESTRICT,
        CONSTRAINT "FK_quiz_grade_audit_logs_users"
          FOREIGN KEY (adjusted_by) REFERENCES users(id) ON DELETE RESTRICT
      );
      CREATE INDEX "IDX_quiz_grade_audit_logs_attempt"
        ON quiz_grade_audit_logs(attempt_id, created_at);
      CREATE INDEX "IDX_quiz_grade_audit_logs_answer"
        ON quiz_grade_audit_logs(quiz_answer_id, created_at);

      CREATE FUNCTION quiz_grade_audit_logs_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'Grade audit records are immutable'
          USING ERRCODE = 'integrity_constraint_violation',
            CONSTRAINT = 'TRG_quiz_grade_audit_logs_immutable';
      END $$;
      CREATE TRIGGER quiz_grade_audit_logs_immutable
        BEFORE UPDATE OR DELETE ON quiz_grade_audit_logs
        FOR EACH ROW EXECUTE FUNCTION quiz_grade_audit_logs_immutable();
      CREATE TRIGGER quiz_grade_audit_logs_no_truncate
        BEFORE TRUNCATE ON quiz_grade_audit_logs
        FOR EACH STATEMENT EXECUTE FUNCTION quiz_grade_audit_logs_immutable();

      ${GUARD_AFTER}
      ${ANSWERS_GUARD("'SUBMITTING', 'NEEDS_GRADING', 'GRADED', 'COMPLETED'")}
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE quiz_grade_audit_logs;
      DROP FUNCTION quiz_grade_audit_logs_immutable();
      ${GUARD_BEFORE}
      ${ANSWERS_GUARD("'SUBMITTING', 'NEEDS_GRADING'")}
    `);
  }
}
