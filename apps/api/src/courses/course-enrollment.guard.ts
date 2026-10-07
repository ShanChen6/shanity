import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { AuthRequest } from '../auth/auth.guards.js';
import { CourseOwnershipService } from './course-ownership.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const body = (statusCode: number, code: string) => ({
  statusCode,
  message: code,
  code,
});

type EnrollmentRow = { status: string; enrolled: boolean; revoked: boolean };

/**
 * Learner gate for `:courseId` routes, after SessionGuard: the course must be
 * published and the principal actively enrolled. Admins and the course's
 * instructors pass to preview what their students see.
 */
@Injectable()
export class CourseEnrollmentGuard implements CanActivate {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ownership: CourseOwnershipService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const courseId = (request.params as Record<string, string | undefined>)
      .courseId;
    if (!courseId || !UUID.test(courseId))
      throw new NotFoundException(body(404, 'COURSE_NOT_FOUND'));

    const [course] = await this.dataSource.query<EnrollmentRow[]>(
      `SELECT course.status,
         enrollment.user_id IS NOT NULL AS enrolled,
         enrollment.revoked_at IS NOT NULL AS revoked
       FROM courses course
       LEFT JOIN enrollments enrollment
         ON enrollment.course_id = course.id AND enrollment.user_id = $2
       WHERE course.id = $1`,
      [courseId, request.principal.id],
    );
    if (!course) throw new NotFoundException(body(404, 'COURSE_NOT_FOUND'));
    if (await this.ownership.canManageCourse(request.principal, courseId))
      return true;
    if (course.status !== 'published')
      throw new ForbiddenException(body(403, 'COURSE_UNAVAILABLE'));
    if (!course.enrolled)
      throw new ForbiddenException(body(403, 'ENROLLMENT_REQUIRED'));
    if (course.revoked)
      throw new ForbiddenException(body(403, 'ENROLLMENT_SUSPENDED'));
    return true;
  }
}
