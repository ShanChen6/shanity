import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { DatabaseService } from '../../../database/database.module.js';
import type { AuthRequest } from '../../../auth/auth.guards.js';

export const COURSE_PROGRESS_FORBIDDEN =
  'You do not have permission to view progress for this course';

export type OwnedCourse = { id: string; title: string };
export type CourseOwnerRequest = AuthRequest & { ownedCourse?: OwnedCourse };

/**
 * Gate for instructor analytics on a course (`:courseId`). Runs after
 * SessionGuard, which authenticates the principal and enforces @Roles.
 *
 * - admin: any course.
 * - instructor: only courses they own or teach (owner_id / instructor_id,
 *   the same relationship lesson access uses).
 *
 * Unlike CourseOwnershipGuard this never admits students, and a missing course
 * answers 403 to non-admins so course ids cannot be probed (no IDOR oracle).
 */
@Injectable()
export class CourseOwnerGuard implements CanActivate {
  constructor(private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<CourseOwnerRequest>();
    const principal = request.principal;
    const courseId = (request.params as Record<string, string | undefined>)
      .courseId;
    const isAdmin = principal?.roles.includes('admin') ?? false;
    if (!principal || (!isAdmin && !principal.roles.includes('instructor')))
      throw new ForbiddenException(COURSE_PROGRESS_FORBIDDEN);
    if (!courseId || !isUUID(courseId, '4')) {
      if (isAdmin) throw new NotFoundException('Course not found');
      throw new ForbiddenException(COURSE_PROGRESS_FORBIDDEN);
    }

    const [course] = await this.database.dataSource.query<
      Array<
        OwnedCourse & { ownerId: string | null; instructorId: string | null }
      >
    >(
      `SELECT id, title, owner_id AS "ownerId", instructor_id AS "instructorId"
       FROM courses WHERE id = $1`,
      [courseId],
    );
    if (isAdmin) {
      if (!course) throw new NotFoundException('Course not found');
    } else if (
      !course ||
      (course.ownerId !== principal.id && course.instructorId !== principal.id)
    )
      throw new ForbiddenException(COURSE_PROGRESS_FORBIDDEN);

    request.ownedCourse = { id: course.id, title: course.title };
    return true;
  }
}
