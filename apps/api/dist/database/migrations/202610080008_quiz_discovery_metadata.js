export class QuizDiscoveryMetadata1791417600008 {
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE TYPE "QuizDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
      ALTER TABLE quizzes
        ADD COLUMN difficulty "QuizDifficulty",
        ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
        ADD CONSTRAINT "CHK_quizzes_tags" CHECK (
          cardinality(tags) <= 10 AND array_position(tags, NULL) IS NULL
        );
      CREATE INDEX "IDX_quizzes_tags" ON quizzes USING gin (tags);
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      DROP INDEX "IDX_quizzes_tags";
      ALTER TABLE quizzes
        DROP CONSTRAINT "CHK_quizzes_tags",
        DROP COLUMN tags,
        DROP COLUMN difficulty;
      DROP TYPE "QuizDifficulty";
    `);
    }
}
//# sourceMappingURL=202610080008_quiz_discovery_metadata.js.map