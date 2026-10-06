import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';

/**
 * Progress and resume APIs need an *active* enrollment. A revoked/paused
 * enrollment (row kept, revoked_at set) is reported distinctly from "never
 * enrolled" so the client can explain it; lesson_progress is kept, so
 * reinstating the enrollment restores the student's progress unchanged.
 */
@Injectable()
export class EnrollmentPolicy {
  constructor(private readonly database: DatabaseService) {}

  async requireActive(userId: string, courseId: string) {
    const [row] = await this.database.dataSource.query<
      Array<{ revoked: boolean }>
    >(
      `SELECT revoked_at IS NOT NULL AS revoked
       FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId],
    );
    if (!row)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ENROLLMENT_REQUIRED',
        message: 'Active enrollment required',
      });
    if (row.revoked)
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ENROLLMENT_SUSPENDED',
        message: 'Enrollment Suspended',
      });
  }
}
