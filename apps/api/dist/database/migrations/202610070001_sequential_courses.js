export class SequentialCourses1791331200001 {
    async up(queryRunner) {
        await queryRunner.query(`
      ALTER TABLE courses
        ADD COLUMN is_sequential boolean NOT NULL DEFAULT false;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE courses DROP COLUMN is_sequential`);
    }
}
//# sourceMappingURL=202610070001_sequential_courses.js.map