export class QuizCoreSchema1791417600001 {
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TYPE "QuizScope" AS ENUM ('LESSON', 'CHAPTER', 'COURSE', 'STANDALONE');
      CREATE TYPE "QuizStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
      CREATE TYPE "ReviewPolicy" AS ENUM ('ALWAYS', 'AFTER_PASS', 'AFTER_EXHAUSTED', 'NEVER');
      CREATE TYPE "GradingPolicy" AS ENUM ('HIGHEST', 'LATEST');

      CREATE TABLE quizzes (
        id uuid PRIMARY KEY DEFAULT public.uuid_generate_v4(),
        title varchar(255) NOT NULL,
        slug varchar(255),
        description text,
        scope "QuizScope" NOT NULL DEFAULT 'LESSON',
        target_id uuid,
        status "QuizStatus" NOT NULL DEFAULT 'DRAFT',
        passing_score smallint NOT NULL DEFAULT 80,
        max_attempts smallint,
        duration_minutes integer,
        is_required boolean NOT NULL DEFAULT false,
        review_policy "ReviewPolicy" NOT NULL DEFAULT 'ALWAYS',
        grading_policy "GradingPolicy" NOT NULL DEFAULT 'HIGHEST',
        shuffle_questions boolean NOT NULL DEFAULT true,
        shuffle_options boolean NOT NULL DEFAULT true,
        version integer NOT NULL DEFAULT 1,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_quizzes_passing_score"
          CHECK (passing_score >= 0 AND passing_score <= 100),
        CONSTRAINT "CHK_quizzes_max_attempts"
          CHECK (max_attempts IS NULL OR max_attempts > 0),
        CONSTRAINT "CHK_quizzes_duration_minutes"
          CHECK (duration_minutes IS NULL OR duration_minutes > 0),
        CONSTRAINT "CHK_quizzes_target_context"
          CHECK (
            (scope = 'STANDALONE' AND target_id IS NULL)
            OR (scope <> 'STANDALONE' AND target_id IS NOT NULL)
          ),
        CONSTRAINT "FK_quizzes_users"
          FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
      );

      CREATE INDEX "IDX_quizzes_scope_target" ON quizzes(scope, target_id);
      CREATE UNIQUE INDEX "UQ_quizzes_slug"
        ON quizzes(slug) WHERE slug IS NOT NULL;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      DROP TABLE quizzes;
      DROP TYPE "GradingPolicy";
      DROP TYPE "ReviewPolicy";
      DROP TYPE "QuizStatus";
      DROP TYPE "QuizScope";
    `);
    }
}
//# sourceMappingURL=202610080001_quiz_core_schema.js.map