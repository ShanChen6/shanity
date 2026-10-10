import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../../auth/auth.service.js';
import { managesCourseSql } from '../../courses/course-ownership.service.js';
import { ChatAccessService } from '../chat/chat-access.service.js';
import { normalizeEmbedUrl, type EmbedOptions } from './embed-url.js';
import {
  LiveSessionProvider,
  LiveSessionStatus,
} from './entities/live-session.entity.js';
import type { CreateLiveSessionDto } from './live-session.dto.js';

const error = (statusCode: number, code: string) => ({
  statusCode,
  message: code,
  code,
});

export type ViewerRole = 'admin' | 'instructor' | 'student';

/** Providers whose embed plays the recording once the live has ended. */
const REPLAYABLE = new Set([
  LiveSessionProvider.YOUTUBE,
  LiveSessionProvider.VIMEO,
]);

/**
 * The status as of `now`: CANCELLED and an early ENDED are stored; the
 * rest follows the window [startTime, endTime).
 */
export function effectiveStatus(
  session: { status: LiveSessionStatus; startTime: Date; endTime: Date },
  now: Date,
): LiveSessionStatus {
  if (session.status === LiveSessionStatus.CANCELLED) return session.status;
  if (session.status === LiveSessionStatus.ENDED || now >= session.endTime)
    return LiveSessionStatus.ENDED;
  if (now >= session.startTime) return LiveSessionStatus.LIVE;
  return LiveSessionStatus.SCHEDULED;
}

/**
 * Learners get the player URL only while the class is on, or afterwards
 * as a replay where the provider keeps one. Before the start it is not in
 * the response at all, so nothing can leak to the page or the network log.
 */
export function embedVisible(
  role: ViewerRole,
  status: LiveSessionStatus,
  provider: LiveSessionProvider,
) {
  if (role !== 'student') return true;
  if (status === LiveSessionStatus.LIVE) return true;
  return status === LiveSessionStatus.ENDED && REPLAYABLE.has(provider);
}

export function embedOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): EmbedOptions {
  const list = (value?: string) =>
    (value ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
  return {
    jitsiHosts: list(env.LIVE_JITSI_HOSTS),
    customHosts: list(env.LIVE_EMBED_ALLOWED_HOSTS),
  };
}

type Row = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  embedUrl: string;
  provider: LiveSessionProvider;
  status: LiveSessionStatus;
  course: { id: string; title: string; slug: string };
  instructor: { id: string; name: string; avatarUrl: string | null };
};

const COLUMNS = `session.id, session.course_id AS "courseId", session.title,
  session.description, session.start_time AS "startTime",
  session.end_time AS "endTime", session.embed_url AS "embedUrl",
  session.provider, session.status,
  json_build_object('id', course.id, 'title', course.title, 'slug', course.slug)
    AS course,
  json_build_object('id', teacher.id, 'name', teacher.display_name,
    'avatarUrl', CASE WHEN teacher.avatar_key IS NULL THEN NULL
      ELSE '/avatars/' || teacher.avatar_key END) AS instructor`;
const FROM = `FROM live_sessions session
  INNER JOIN courses course ON course.id = session.course_id
  INNER JOIN users teacher ON teacher.id = session.instructor_id`;

/**
 * Live classes of a course: scheduling by its teachers, viewing by its
 * members. Membership is exactly the course chat's (ChatAccessService):
 * teachers, and learners with an active enrollment in a published course.
 */
@Injectable()
export class LiveSessionsService {
  private readonly embedOptions = embedOptionsFromEnv();

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: ChatAccessService,
  ) {}

  async create(
    principal: Principal,
    courseId: string,
    dto: CreateLiveSessionDto,
  ) {
    const role = await this.roleIn(principal, courseId);
    if (role === 'student')
      throw new ForbiddenException(error(403, 'LIVE_SESSION_FORBIDDEN'));
    const embed = normalizeEmbedUrl(dto.embedUrl, this.embedOptions);
    if (!embed)
      throw new BadRequestException(error(400, 'LIVE_EMBED_URL_INVALID'));
    if (
      dto.provider &&
      dto.provider !== (embed.provider as LiveSessionProvider)
    )
      throw new BadRequestException(error(400, 'LIVE_EMBED_PROVIDER_MISMATCH'));
    const [{ id }] = await this.dataSource.query<Array<{ id: string }>>(
      `INSERT INTO live_sessions (course_id, instructor_id, title, description,
         start_time, end_time, embed_url, provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        courseId,
        principal.id,
        dto.title,
        dto.description?.trim() || null,
        dto.startTime,
        dto.endTime,
        embed.embedUrl,
        embed.provider,
      ],
    );
    return this.get(principal, id);
  }

  /** All sessions of the course, earliest first, each with its status. */
  async list(principal: Principal, courseId: string) {
    const role = await this.roleIn(principal, courseId);
    const rows = await this.dataSource.query<Row[]>(
      `SELECT ${COLUMNS} ${FROM} WHERE session.course_id = $1
       ORDER BY session.start_time, session.id`,
      [courseId],
    );
    const now = new Date();
    return {
      serverTime: now.toISOString(),
      sessions: rows.map((row) => this.view(row, role, now)),
    };
  }

  async get(principal: Principal, id: string) {
    const row = await this.find(id);
    const role = await this.roleIn(principal, row.courseId);
    const now = new Date();
    return {
      serverTime: now.toISOString(),
      session: this.view(row, role, now),
    };
  }

  /**
   * The caller's timetable between two instants: sessions of courses they
   * learn in (active enrollment, published course) or teach. Nothing else,
   * whatever their platform role. No player URLs: the calendar links to
   * the session page, which applies its own gate.
   */
  async mySchedule(principal: Principal, from: string, to: string) {
    const rows = await this.dataSource.query<Array<Row & { teaches: boolean }>>(
      `SELECT ${COLUMNS}, ${managesCourseSql('$1')} AS teaches ${FROM}
       WHERE session.start_time < $3 AND session.end_time > $2
         AND (
           ${managesCourseSql('$1')}
           OR (course.status = 'published' AND EXISTS (
             SELECT 1 FROM enrollments e
             WHERE e.course_id = course.id AND e.user_id = $1
               AND e.revoked_at IS NULL))
         )
       ORDER BY session.start_time, session.id`,
      [principal.id, from, to],
    );
    const now = new Date();
    return {
      serverTime: now.toISOString(),
      sessions: rows.map((row) => ({
        id: row.id,
        title: row.title,
        courseId: row.courseId,
        courseName: row.course.title,
        courseSlug: row.course.slug,
        instructorName: row.instructor.name,
        startTime: new Date(row.startTime).toISOString(),
        endTime: new Date(row.endTime).toISOString(),
        status: effectiveStatus(row, now),
        provider: row.provider,
        role: row.teaches ? ('instructor' as const) : ('student' as const),
        /** The session page in the web app. */
        liveClassUrl: `/student/courses/${encodeURIComponent(row.course.slug)}/live/${row.id}`,
      })),
    };
  }

  /** Teachers cancel a session, or end it before its scheduled end. */
  async setStatus(
    principal: Principal,
    id: string,
    status: LiveSessionStatus.CANCELLED | LiveSessionStatus.ENDED,
  ) {
    const row = await this.find(id);
    if ((await this.roleIn(principal, row.courseId)) === 'student')
      throw new ForbiddenException(error(403, 'LIVE_SESSION_FORBIDDEN'));
    const current = effectiveStatus(row, new Date());
    const allowed =
      status === LiveSessionStatus.CANCELLED
        ? current === LiveSessionStatus.SCHEDULED
        : current === LiveSessionStatus.LIVE;
    if (!allowed)
      throw new ConflictException(
        error(409, 'LIVE_SESSION_INVALID_TRANSITION'),
      );
    await this.dataSource.query(
      'UPDATE live_sessions SET status = $2 WHERE id = $1',
      [id, status],
    );
    return this.get(principal, id);
  }

  async find(id: string): Promise<Row> {
    const [row] = await this.dataSource.query<Row[]>(
      `SELECT ${COLUMNS} ${FROM} WHERE session.id = $1`,
      [id],
    );
    if (!row) throw new NotFoundException(error(404, 'LIVE_SESSION_NOT_FOUND'));
    return row;
  }

  /** Admins see every course; otherwise course membership (403/404). */
  async roleIn(principal: Principal, courseId: string): Promise<ViewerRole> {
    if (principal.roles.includes('admin')) {
      const [course] = await this.dataSource.query(
        'SELECT 1 FROM courses WHERE id = $1',
        [courseId],
      );
      if (!course) throw new NotFoundException(error(404, 'COURSE_NOT_FOUND'));
      return 'admin';
    }
    return (await this.access.memberFor(principal.id, courseId)).role;
  }

  private view(row: Row, role: ViewerRole, now: Date) {
    const status = effectiveStatus(row, now);
    const visible = embedVisible(role, status, row.provider);
    return {
      id: row.id,
      courseId: row.courseId,
      course: row.course,
      instructor: row.instructor,
      title: row.title,
      description: row.description,
      startTime: new Date(row.startTime).toISOString(),
      endTime: new Date(row.endTime).toISOString(),
      provider: row.provider,
      status,
      /** Null while the viewer may not play it (never sent early). */
      embedUrl: visible ? row.embedUrl : null,
      isReplay: visible && status === LiveSessionStatus.ENDED,
      canManage: role !== 'student',
    };
  }
}
