export class QuizQuestionsOptions1791417600003 {
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TYPE "QuizQuestionType" AS ENUM ('SINGLE_CHOICE', 'MULTIPLE_CHOICE');

      CREATE TABLE quiz_questions (
        id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
        quiz_id uuid NOT NULL,
        type "QuizQuestionType" NOT NULL DEFAULT 'SINGLE_CHOICE',
        content text NOT NULL,
        position smallint NOT NULL DEFAULT 1,
        points smallint NOT NULL DEFAULT 10,
        explanation text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_quiz_questions_points" CHECK (points > 0),
        CONSTRAINT "CHK_quiz_questions_content" CHECK (btrim(content) <> ''),
        CONSTRAINT "FK_quiz_questions_quizzes"
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
      );
      CREATE INDEX "IDX_quiz_questions_quiz_position"
        ON quiz_questions(quiz_id, position);

      CREATE FUNCTION touch_quiz_question_updated_at() RETURNS trigger
      LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at = clock_timestamp(); RETURN NEW; END $$;
      CREATE TRIGGER quiz_questions_updated_at BEFORE UPDATE ON quiz_questions
        FOR EACH ROW EXECUTE FUNCTION touch_quiz_question_updated_at();

      CREATE TABLE quiz_options (
        id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
        question_id uuid NOT NULL,
        content text NOT NULL,
        position smallint NOT NULL DEFAULT 1,
        is_correct boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_quiz_options_content" CHECK (btrim(content) <> ''),
        CONSTRAINT "FK_quiz_options_questions"
          FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
      );
      CREATE INDEX "IDX_quiz_options_question_position"
        ON quiz_options(question_id, position);
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      DROP TABLE quiz_options;
      DROP TRIGGER quiz_questions_updated_at ON quiz_questions;
      DROP FUNCTION touch_quiz_question_updated_at();
      DROP TABLE quiz_questions;
      DROP TYPE "QuizQuestionType";
    `);
    }
}
//# sourceMappingURL=202610080003_quiz_questions_options.js.map