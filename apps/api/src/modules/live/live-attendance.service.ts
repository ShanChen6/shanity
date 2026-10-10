import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../../auth/auth.service.js';
import { LiveSessionStatus } from './entities/live-session.entity.js';
import {
  LiveSessionsService,
  effectiveStatus,
} from './live-sessions.service.js';

/** The client pings every 30 s of visible time; one ping is worth that much. */
export const HEARTBEAT_INTERVAL_SECONDS = 30;
/** Pings closer together than this credit nothing (spam, double tabs). */
export const HEARTBEAT_MIN_GAP_SECONDS = 20;

const error = (statusCode: number, code: string) => ({
  statusCode,
  message: code,
  code,
});

/** Seconds of a session a student must be credited with to have attended. */
export function requiredSeconds(
  session: { startTime: Date; endTime: Date },
  thresholdPercent: number,
) {
  const length =
    (session.endTime.getTime() - session.startTime.getTime()) / 1000;
  return Math.ceil((length * thresholdPercent) / 100);
}

export interface AttendanceState {
  durationSeconds: number;
  requiredSeconds: number;
  isAttended: boolean;
}

/**
 * Heartbeat attendance. Time is credited by the server only, from pings it
 * accepts: each is worth at most HEARTBEAT_INTERVAL_SECONDS, and never more
 * than the time since the previous accepted ping (or since the start), so
 * neither a fast nor a lying client can buy time. The credit and the
 * "at least HEARTBEAT_MIN_GAP_SECONDS since the last ping" test are one
 * atomic statement: a burst of concurrent pings credits one interval.
 */
@Injectable()
export class LiveAttendanceService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly sessions: LiveSessionsService,
  ) {}

  async heartbeat(principal: Principal, sessionId: string) {
    const { session, required } = await this.studentSession(
      principal,
      sessionId,
    );
    if (effectiveStatus(session, new Date()) !== LiveSessionStatus.LIVE)
      throw new ConflictException(error(409, 'LIVE_SESSION_NOT_LIVE'));
    const length = Math.round(
      (new Date(session.endTime).getTime() -
        new Date(session.startTime).getTime()) /
        1000,
    );

    const [credited] = await this.dataSource.query<
      Array<{ durationSeconds: number; isAttended: boolean }>
    >(
      `WITH credit AS (
         SELECT $3::int AS max, $4::int AS required, $6::int AS length)
       INSERT INTO live_attendances AS a
         (session_id, student_id, duration_seconds, is_attended)
       SELECT $1, $2, d, d >= required FROM credit,
         LATERAL (SELECT LEAST(max, length, GREATEST(0,
           floor(extract(epoch FROM now() - $5::timestamptz))))::int AS d) first
       ON CONFLICT (session_id, student_id) DO UPDATE SET
         duration_seconds = LEAST($6::int, a.duration_seconds + LEAST($3::int,
           floor(extract(epoch FROM now() - a.last_active_at))::int)),
         is_attended = a.is_attended OR LEAST($6::int, a.duration_seconds
           + LEAST($3::int, floor(extract(epoch FROM now() - a.last_active_at))::int))
           >= $4::int,
         last_active_at = now()
       WHERE a.last_active_at <= now() - make_interval(secs => $7::int)
       RETURNING a.duration_seconds AS "durationSeconds",
         a.is_attended AS "isAttended"`,
      [
        sessionId,
        principal.id,
        HEARTBEAT_INTERVAL_SECONDS,
        required,
        session.startTime,
        length,
        HEARTBEAT_MIN_GAP_SECONDS,
      ],
    );
    if (credited)
      return { accepted: true, ...credited, requiredSeconds: required };

    // Too soon after the last accepted ping: nothing credited.
    const state = await this.state(principal.id, sessionId, required);
    return { accepted: false, ...state };
  }

  /** The caller's own standing, for the indicator on (re)load. */
  async mine(
    principal: Principal,
    sessionId: string,
  ): Promise<AttendanceState> {
    const { required } = await this.studentSession(principal, sessionId);
    return this.state(principal.id, sessionId, required);
  }

  /**
   * Every active learner of the course, present or not, plus anyone who
   * attended and has since lost their enrollment. Teachers and admins only.
   */
  async report(principal: Principal, courseId: string, sessionId: string) {
    const session = await this.sessions.find(sessionId);
    if (session.courseId !== courseId)
      throw new NotFoundException(error(404, 'LIVE_SESSION_NOT_FOUND'));
    if ((await this.sessions.roleIn(principal, courseId)) === 'student')
      throw new ForbiddenException(
        error(403, 'LIVE_ATTENDANCE_REPORT_FORBIDDEN'),
      );
    const threshold = await this.threshold(courseId);
    const required = requiredSeconds(
      {
        startTime: new Date(session.startTime),
        endTime: new Date(session.endTime),
      },
      threshold,
    );
    const rows = await this.dataSource.query<
      Array<{
        studentId: string;
        name: string;
        email: string;
        enrolled: boolean;
        durationSeconds: number;
        isAttended: boolean;
        firstJoinedAt: Date | null;
        lastActiveAt: Date | null;
      }>
    >(
      `SELECT member.id AS "studentId", member.display_name AS name,
         member.email,
         (e.user_id IS NOT NULL AND e.revoked_at IS NULL) AS enrolled,
         coalesce(a.duration_seconds, 0) AS "durationSeconds",
         coalesce(a.is_attended, false) AS "isAttended",
         a.first_joined_at AS "firstJoinedAt", a.last_active_at AS "lastActiveAt"
       FROM users member
       LEFT JOIN enrollments e ON e.user_id = member.id AND e.course_id = $1
       LEFT JOIN live_attendances a
         ON a.student_id = member.id AND a.session_id = $2
       WHERE (e.user_id IS NOT NULL AND e.revoked_at IS NULL) OR a.id IS NOT NULL
       ORDER BY a.is_attended DESC NULLS LAST, member.display_name, member.id`,
      [courseId, sessionId],
    );
    const students = rows.map((row) => ({
      ...row,
      status: row.isAttended ? ('PRESENT' as const) : ('ABSENT' as const),
      firstJoinedAt: row.firstJoinedAt
        ? new Date(row.firstJoinedAt).toISOString()
        : null,
      lastActiveAt: row.lastActiveAt
        ? new Date(row.lastActiveAt).toISOString()
        : null,
    }));
    const present = students.filter((s) => s.status === 'PRESENT').length;
    return {
      sessionId,
      thresholdPercent: threshold,
      requiredSeconds: required,
      summary: {
        total: students.length,
        present,
        absent: students.length - present,
      },
      students,
    };
  }

  /** The session, for a learner of its course (teachers do not attend). */
  private async studentSession(principal: Principal, sessionId: string) {
    const session = await this.sessions.find(sessionId);
    const role = await this.sessions.roleIn(principal, session.courseId);
    if (role !== 'student')
      throw new ForbiddenException(error(403, 'LIVE_ATTENDANCE_STUDENTS_ONLY'));
    const required = requiredSeconds(
      {
        startTime: new Date(session.startTime),
        endTime: new Date(session.endTime),
      },
      await this.threshold(session.courseId),
    );
    return { session, required };
  }

  private async threshold(courseId: string): Promise<number> {
    const [course] = await this.dataSource.query<Array<{ threshold: number }>>(
      'SELECT live_attendance_threshold AS threshold FROM courses WHERE id = $1',
      [courseId],
    );
    return course?.threshold ?? 50;
  }

  private async state(
    studentId: string,
    sessionId: string,
    required: number,
  ): Promise<AttendanceState> {
    const [row] = await this.dataSource.query<
      Array<{ durationSeconds: number; isAttended: boolean }>
    >(
      `SELECT duration_seconds AS "durationSeconds", is_attended AS "isAttended"
       FROM live_attendances WHERE session_id = $1 AND student_id = $2`,
      [sessionId, studentId],
    );
    return {
      durationSeconds: row?.durationSeconds ?? 0,
      isAttended: row?.isAttended ?? false,
      requiredSeconds: required,
    };
  }
}
