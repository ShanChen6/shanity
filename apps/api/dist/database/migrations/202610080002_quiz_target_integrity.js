export class QuizTargetIntegrity1791417600002 {
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE quizzes DROP CONSTRAINT "CHK_quizzes_target_context";
      ALTER TABLE quizzes ADD CONSTRAINT "CHK_quizzes_scope_target_integrity"
        CHECK (
          (scope = 'STANDALONE' AND target_id IS NULL)
          OR (scope IN ('LESSON', 'CHAPTER', 'COURSE') AND target_id IS NOT NULL)
        );

      CREATE FUNCTION quizzes_check_target() RETURNS trigger
      LANGUAGE plpgsql AS $$
      DECLARE
        current_scope "QuizScope";
        current_target uuid;
      BEGIN
        -- Deferred: validate the row as it stands at commit, not as queued.
        SELECT scope, target_id INTO current_scope, current_target
        FROM quizzes WHERE id = NEW.id;
        IF NOT FOUND OR current_target IS NULL THEN
          RETURN NULL;
        END IF;

        IF current_scope = 'LESSON' THEN
          PERFORM 1 FROM lessons WHERE id = current_target FOR KEY SHARE;
        ELSIF current_scope = 'CHAPTER' THEN
          PERFORM 1 FROM chapters WHERE id = current_target FOR KEY SHARE;
        ELSIF current_scope = 'COURSE' THEN
          PERFORM 1 FROM courses WHERE id = current_target FOR KEY SHARE;
        END IF;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Quiz % target % is not an existing %',
            NEW.id, current_target, lower(current_scope::text)
            USING ERRCODE = 'foreign_key_violation',
              CONSTRAINT = 'FK_quizzes_target',
              TABLE = 'quizzes';
        END IF;
        RETURN NULL;
      END $$;

      CREATE CONSTRAINT TRIGGER "TRG_quizzes_target_exists"
        AFTER INSERT OR UPDATE OF scope, target_id ON quizzes
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION quizzes_check_target();

      CREATE FUNCTION quizzes_restrict_target_delete() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM quizzes
          WHERE scope = TG_ARGV[0]::"QuizScope"
            AND target_id = OLD.id
            AND status <> 'ARCHIVED'
        ) THEN
          RAISE EXCEPTION 'Cannot delete % %: a non-archived quiz targets it',
            lower(TG_ARGV[0]), OLD.id
            USING ERRCODE = 'foreign_key_violation',
              CONSTRAINT = 'FK_quizzes_target',
              TABLE = TG_TABLE_NAME;
        END IF;
        RETURN OLD;
      END $$;

      CREATE TRIGGER "TRG_lessons_quiz_target_restrict"
        BEFORE DELETE ON lessons
        FOR EACH ROW EXECUTE FUNCTION quizzes_restrict_target_delete('LESSON');
      CREATE TRIGGER "TRG_chapters_quiz_target_restrict"
        BEFORE DELETE ON chapters
        FOR EACH ROW EXECUTE FUNCTION quizzes_restrict_target_delete('CHAPTER');
      CREATE TRIGGER "TRG_courses_quiz_target_restrict"
        BEFORE DELETE ON courses
        FOR EACH ROW EXECUTE FUNCTION quizzes_restrict_target_delete('COURSE');
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      DROP TRIGGER "TRG_courses_quiz_target_restrict" ON courses;
      DROP TRIGGER "TRG_chapters_quiz_target_restrict" ON chapters;
      DROP TRIGGER "TRG_lessons_quiz_target_restrict" ON lessons;
      DROP FUNCTION quizzes_restrict_target_delete();
      DROP TRIGGER "TRG_quizzes_target_exists" ON quizzes;
      DROP FUNCTION quizzes_check_target();

      ALTER TABLE quizzes DROP CONSTRAINT "CHK_quizzes_scope_target_integrity";
      ALTER TABLE quizzes ADD CONSTRAINT "CHK_quizzes_target_context"
        CHECK (
          (scope = 'STANDALONE' AND target_id IS NULL)
          OR (scope <> 'STANDALONE' AND target_id IS NOT NULL)
        );
    `);
    }
}
//# sourceMappingURL=202610080002_quiz_target_integrity.js.map