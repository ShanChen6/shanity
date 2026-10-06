import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../auth/auth.service.js';

/**
 * SQL predicate: user `userParam` owns, teaches or is assigned to the course
 * aliased `course`. Shared by list queries so they filter exactly as
 * CourseOwnershipService.canManageCourse decides.
 */
export const managesCourseSql = (userParam: string) =>
  `(${userParam} IN (course.owner_id, course.instructor_id)
    OR EXISTS (
      SELECT 1 FROM course_instructors assignment
      WHERE assignment.course_id = course.id
        AND assignment.user_id = ${userParam}
    ))`;

/** Who holds authoring authority over a course. */
@Injectable()
export class CourseOwnershipService {
  constructor(private readonly dataSource: DataSource) {}

  /** Admins, or instructors who own, teach or are assigned to the course. */
  async canManageCourse(
    principal: Pick<Principal, 'id' | 'roles'>,
    courseId: string | null,
  ) {
    if (principal.roles.includes('admin')) return true;
    if (!courseId || !principal.roles.includes('instructor')) return false;
    const [row] = await this.dataSource.query<Array<{ allowed: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM courses course
         WHERE course.id = $1 AND ${managesCourseSql('$2')}
       ) AS allowed`,
      [courseId, principal.id],
    );
    return row?.allowed === true;
  }
}
