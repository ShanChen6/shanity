export class QuizStandaloneNotRequired1791417600005 {
    async up(queryRunner) {
        await queryRunner.query(`
      -- The flag was meaningless on standalone quizzes; clear it before enforcing.
      UPDATE quizzes SET is_required = false
      WHERE scope = 'STANDALONE' AND is_required;
      ALTER TABLE quizzes ADD CONSTRAINT "CHK_quizzes_standalone_not_required"
        CHECK (scope <> 'STANDALONE' OR NOT is_required);
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE quizzes DROP CONSTRAINT "CHK_quizzes_standalone_not_required";
    `);
    }
}
//# sourceMappingURL=202610080005_quiz_standalone_not_required.js.map