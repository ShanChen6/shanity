import type { MigrationInterface, QueryRunner } from 'typeorm';

// Instructor progress lists active enrollments of one course.
export class EnrollmentsCourseActiveIndex1791331200002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX idx_enrollments_course_user_active
        ON enrollments(course_id, user_id) WHERE revoked_at IS NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_enrollments_course_user_active`);
  }
}
