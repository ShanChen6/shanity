export class AddIsRequiredToLessons1791244800002 {
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE lessons
        ADD COLUMN is_required boolean NOT NULL DEFAULT true;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE lessons DROP COLUMN is_required`);
    }
}
//# sourceMappingURL=202610060002_lesson_required.js.map