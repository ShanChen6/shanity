export class QuizPublishedAt1791417600006 {
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE quizzes ADD COLUMN published_at timestamptz;
      -- Best available instant for quizzes published before the gate existed.
      UPDATE quizzes SET published_at = updated_at WHERE status = 'PUBLISHED';
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE quizzes DROP COLUMN published_at;`);
    }
}
//# sourceMappingURL=202610080006_quiz_published_at.js.map