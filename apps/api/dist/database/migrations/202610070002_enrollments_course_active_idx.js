export class EnrollmentsCourseActiveIndex1791331200002 {
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE INDEX idx_enrollments_course_user_active
        ON enrollments(course_id, user_id) WHERE revoked_at IS NULL;
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX idx_enrollments_course_user_active`);
    }
}
//# sourceMappingURL=202610070002_enrollments_course_active_idx.js.map