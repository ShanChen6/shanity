export class QuizAttempts1791417600004 {
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TYPE "QuizAttemptStatus" AS ENUM
        ('IN_PROGRESS', 'SUBMITTED', 'TIMED_OUT', 'ABANDONED');

      CREATE TABLE quiz_attempts (
        id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
        user_id uuid NOT NULL,
        quiz_id uuid NOT NULL,
        quiz_version integer NOT NULL,
        attempt_number smallint NOT NULL,
        quiz_snapshot jsonb NOT NULL,
        status "QuizAttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
        started_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz,
        submitted_at timestamptz,
        score smallint,
        is_passed boolean,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_quiz_attempts_quiz_version" CHECK (quiz_version > 0),
        CONSTRAINT "CHK_quiz_attempts_attempt_number" CHECK (attempt_number > 0),
        CONSTRAINT "CHK_quiz_attempts_snapshot"
          CHECK (jsonb_typeof(quiz_snapshot) = 'object'),
        CONSTRAINT "CHK_quiz_attempts_score"
          CHECK (score IS NULL OR score BETWEEN 0 AND 100),
        CONSTRAINT "CHK_quiz_attempts_expires_at"
          CHECK (expires_at IS NULL OR expires_at > started_at),
        CONSTRAINT "CHK_quiz_attempts_state" CHECK (
          (status = 'IN_PROGRESS'
            AND submitted_at IS NULL AND score IS NULL AND is_passed IS NULL)
          OR (status IN ('SUBMITTED', 'TIMED_OUT')
            AND submitted_at IS NOT NULL AND score IS NOT NULL
            AND is_passed IS NOT NULL)
          OR (status = 'ABANDONED' AND score IS NULL AND is_passed IS NULL)
        ),
        CONSTRAINT "FK_quiz_attempts_users"
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT "FK_quiz_attempts_quizzes"
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE RESTRICT,
        CONSTRAINT "UQ_quiz_attempts_user_quiz_number"
          UNIQUE (user_id, quiz_id, attempt_number)
      );
      CREATE INDEX "IDX_quiz_attempts_user_quiz"
        ON quiz_attempts(user_id, quiz_id, status);
      CREATE UNIQUE INDEX "UQ_quiz_attempts_active"
        ON quiz_attempts(user_id, quiz_id) WHERE status = 'IN_PROGRESS';

      CREATE FUNCTION quiz_attempts_guard_update() RETURNS trigger
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
      CREATE TRIGGER quiz_attempts_guard_update BEFORE UPDATE ON quiz_attempts
        FOR EACH ROW EXECUTE FUNCTION quiz_attempts_guard_update();

      CREATE TABLE attempt_answers (
        id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
        attempt_id uuid NOT NULL,
        -- Snapshot identities, deliberately without FKs to authoring rows.
        question_id uuid NOT NULL,
        selected_option_ids uuid[] NOT NULL DEFAULT '{}',
        is_correct boolean,
        points_earned smallint DEFAULT 0,
        saved_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_attempt_answers_points_earned"
          CHECK (points_earned IS NULL OR points_earned >= 0),
        CONSTRAINT "CHK_attempt_answers_selected_option_ids"
          CHECK (array_position(selected_option_ids, NULL) IS NULL),
        CONSTRAINT "FK_attempt_answers_quiz_attempts"
          FOREIGN KEY (attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX "IDX_attempt_answers_attempt_question"
        ON attempt_answers(attempt_id, question_id);

      -- Answers change only while their attempt runs. FOR SHARE also queues an
      -- autosave behind a concurrent submit holding the attempt FOR UPDATE.
      CREATE FUNCTION attempt_answers_require_open_attempt() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        attempt_status "QuizAttemptStatus";
      BEGIN
        SELECT status INTO attempt_status FROM quiz_attempts
        WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.attempt_id
                        ELSE NEW.attempt_id END
        FOR SHARE;
        -- A missing attempt is either a cascade delete or an FK violation.
        IF FOUND AND attempt_status <> 'IN_PROGRESS' THEN
          RAISE EXCEPTION 'Quiz attempt is not in progress'
            USING ERRCODE = 'integrity_constraint_violation',
              CONSTRAINT = 'TRG_attempt_answers_open_attempt';
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER attempt_answers_require_open_attempt
        BEFORE INSERT OR UPDATE OR DELETE ON attempt_answers
        FOR EACH ROW EXECUTE FUNCTION attempt_answers_require_open_attempt();
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      DROP TABLE attempt_answers;
      DROP FUNCTION attempt_answers_require_open_attempt();
      DROP TABLE quiz_attempts;
      DROP FUNCTION quiz_attempts_guard_update();
      DROP TYPE "QuizAttemptStatus";
    `);
    }
}
//# sourceMappingURL=202610080004_quiz_attempts.js.map