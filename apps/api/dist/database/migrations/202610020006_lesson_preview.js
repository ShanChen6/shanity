export class LessonPreview1790899200006 {
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE lessons
        ADD COLUMN is_preview boolean NOT NULL DEFAULT false;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query('ALTER TABLE lessons DROP COLUMN is_preview');
    }
}
//# sourceMappingURL=202610020006_lesson_preview.js.map