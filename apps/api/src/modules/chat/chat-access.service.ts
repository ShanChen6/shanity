import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { managesCourseSql } from '../../courses/course-ownership.service.js';
import type { ChatMember } from './realtime/realtime-provider.js';

const body = (statusCode: number, code: string) => ({
  statusCode,
  message: code,
  code,
});

type MemberRow = {
  status: string;
  teaches: boolean;
  enrolled: boolean;
  revoked: boolean;
  name: string;
  avatarKey: string | null;
};

/**
 * Who is a member of a course's chat room (docs/permissions.md):
 *
 *  - the course's teachers (owner, instructor or assigned), whatever its status;
 *  - learners with an active (not revoked) enrollment in a published course.
 *
 * Nothing else lets anyone in. A platform role is not a membership: an admin
 * with neither relation is refused like anyone else (moderation has its own
 * endpoints). Always answered from the database, never a cache, so a revoked
 * enrollment or a removed assignment takes effect on the very next request.
 */
@Injectable()
export class ChatAccessService {
  constructor(private readonly dataSource: DataSource) {}

  /** The caller's identity in the room, or a 403/404 if they are not a member. */
  async memberFor(userId: string, courseId: string): Promise<ChatMember> {
    const [row] = await this.dataSource.query<MemberRow[]>(
      `SELECT course.status,
         ${managesCourseSql('$2')} AS teaches,
         enrollment.user_id IS NOT NULL AS enrolled,
         enrollment.revoked_at IS NOT NULL AS revoked,
         member.display_name AS name,
         member.avatar_key AS "avatarKey"
       FROM courses course
       INNER JOIN users member ON member.id = $2
       LEFT JOIN enrollments enrollment
         ON enrollment.course_id = course.id AND enrollment.user_id = $2
       WHERE course.id = $1`,
      [courseId, userId],
    );
    if (!row) throw new NotFoundException(body(404, 'COURSE_NOT_FOUND'));
    const member = (role: ChatMember['role']): ChatMember => ({
      id: userId,
      name: row.name,
      avatarUrl: row.avatarKey ? `/avatars/${row.avatarKey}` : null,
      role,
    });

    if (row.teaches) return member('instructor');
    if (row.status !== 'published')
      throw new ForbiddenException(body(403, 'COURSE_UNAVAILABLE'));
    if (!row.enrolled)
      throw new ForbiddenException(body(403, 'ENROLLMENT_REQUIRED'));
    if (row.revoked)
      throw new ForbiddenException(body(403, 'ENROLLMENT_SUSPENDED'));
    return member('student');
  }

  /** Until when the user may not send in the course's room; null if free. */
  async mutedUntil(userId: string, courseId: string): Promise<Date | null> {
    const [row] = await this.dataSource.query<Array<{ mutedUntil: Date }>>(
      `SELECT muted_until AS "mutedUntil" FROM chat_mutes
       WHERE course_id = $1 AND user_id = $2 AND muted_until > now()`,
      [courseId, userId],
    );
    return row?.mutedUntil ?? null;
  }
}
