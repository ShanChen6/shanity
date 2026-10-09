import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { uniqueViolation, type Principal } from '../../auth/auth.service.js';
import { managesCourseSql } from '../../courses/course-ownership.service.js';
import { ChatAccessService } from './chat-access.service.js';
import { courseChannel } from './chat-channels.js';
import { ChatEvents } from './chat-events.js';
import {
  CHAT_MESSAGE_COLUMNS,
  chatMessageView,
  type ChatMessageRow,
  type ChatMessageView,
} from './chat-message-view.js';
import type { MuteChatUserDto } from './chat.dto.js';
import { RealtimeProvider } from './realtime/realtime-provider.js';

const error = (statusCode: number, code: string) => ({
  statusCode,
  message: code,
  code,
});

type MessageRow = { courseId: string; senderId: string; status: string };

/** Most flagged messages one queue read returns. */
export const CHAT_QUEUE_LIMIT = 100;

export interface ChatQueueReport {
  id: string;
  reason: string;
  reporter: { id: string; name: string };
  createdAt: string;
}

/** A message awaiting a moderator's decision, with its pending reports. */
export interface ChatQueueItem {
  message: ChatMessageView;
  course: { id: string; title: string; slug: string };
  reportCount: number;
  lastReportedAt: string;
  reports: ChatQueueReport[];
}

type QueueRow = ChatMessageRow & {
  courseId: string;
  courseTitle: string;
  courseSlug: string;
  reportCount: number;
  lastReportedAt: Date;
  reports: ChatQueueReport[];
};

/**
 * Reports, the moderation queue, hiding, dismissing and muting in course
 * chats.
 *
 * Moderators of a course are its teachers (owner, instructor, assigned) and
 * platform admins (docs/permissions.md: admins moderate when needed, even
 * though that does not make them room members). Every hide and mute is
 * written to chat_moderation_logs in the same transaction as its effect.
 */
@Injectable()
export class ChatModerationService {
  private readonly logger = new Logger(ChatModerationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly access: ChatAccessService,
    private readonly realtime: RealtimeProvider,
  ) {}

  /**
   * A member reports a message they can see. The first report flags it
   * (ACTIVE -> FLAGGED) so it surfaces to moderators; it stays visible.
   */
  async report(principal: Principal, messageId: string, reason: string) {
    return this.dataSource.transaction(async (manager) => {
      const message = await this.lockMessage(manager, messageId);
      // Membership first: a non-member learns nothing about the message.
      await this.access.memberFor(principal.id, message.courseId);
      // Hidden messages are gone from the room: nothing left to report.
      if (message.status === 'HIDDEN')
        throw new NotFoundException(error(404, 'CHAT_MESSAGE_NOT_FOUND'));
      if (message.senderId === principal.id)
        throw new BadRequestException(error(400, 'CHAT_REPORT_OWN_MESSAGE'));

      let reportId: string;
      try {
        const [row] = await manager.query<Array<{ id: string }>>(
          `INSERT INTO chat_reports(message_id, reporter_id, reason)
           VALUES ($1, $2, $3) RETURNING id`,
          [messageId, principal.id, reason],
        );
        reportId = row.id;
      } catch (cause) {
        if (uniqueViolation(cause))
          throw new ConflictException(error(409, 'CHAT_ALREADY_REPORTED'));
        throw cause;
      }
      await manager.query(
        `UPDATE chat_messages SET status = 'FLAGGED'
         WHERE id = $1 AND status = 'ACTIVE'`,
        [messageId],
      );
      return { reportId, messageId, status: 'PENDING' as const };
    });
  }

  /**
   * Hides a message for learners, resolves its pending reports and tells the
   * room at once. Idempotent: hiding a hidden message changes nothing.
   */
  async hide(principal: Principal, messageId: string, reason?: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const message = await this.lockMessage(manager, messageId);
      await this.assertModerator(principal, message.courseId);
      if (message.status === 'HIDDEN')
        return {
          courseId: message.courseId,
          resolvedReports: 0,
          changed: false,
        };

      await manager.query(
        `UPDATE chat_messages SET status = 'HIDDEN' WHERE id = $1`,
        [messageId],
      );
      // TypeORM answers UPDATE ... RETURNING with [rows, affectedCount].
      const [resolved] = await manager.query<[Array<{ id: string }>, number]>(
        `UPDATE chat_reports
         SET status = 'RESOLVED', resolved_by = $2, resolved_at = now()
         WHERE message_id = $1 AND status = 'PENDING'
         RETURNING id`,
        [messageId, principal.id],
      );
      await manager.query(
        `INSERT INTO chat_moderation_logs
           (course_id, actor_id, action, message_id, reason, details)
         VALUES ($1, $2, 'HIDE_MESSAGE', $3, $4, $5)`,
        [
          message.courseId,
          principal.id,
          messageId,
          reason ?? null,
          { previousStatus: message.status, resolvedReports: resolved.length },
        ],
      );
      return {
        courseId: message.courseId,
        resolvedReports: resolved.length,
        changed: true,
      };
    });

    if (result.changed)
      await this.broadcast(result.courseId, ChatEvents.MESSAGE_HIDDEN, {
        messageId,
      });
    return {
      messageId,
      status: 'HIDDEN' as const,
      resolvedReports: result.resolvedReports,
    };
  }

  /**
   * Messages with pending reports in the courses the caller moderates (one
   * course with `courseId`), most recently reported first.
   */
  async queue(
    principal: Principal,
    courseId?: string,
  ): Promise<ChatQueueItem[]> {
    if (courseId) await this.assertModerator(principal, courseId);
    const rows = await this.dataSource.query<QueueRow[]>(
      `SELECT ${CHAT_MESSAGE_COLUMNS},
         course.id AS "courseId",
         course.title AS "courseTitle",
         course.slug AS "courseSlug",
         pending.count AS "reportCount",
         pending.last AS "lastReportedAt",
         pending.reports
       FROM chat_messages message
       INNER JOIN users sender ON sender.id = message.sender_id
       INNER JOIN courses course ON course.id = message.course_id
       CROSS JOIN LATERAL (
         SELECT count(*)::int AS count,
           max(report.created_at) AS last,
           json_agg(json_build_object(
             'id', report.id,
             'reason', report.reason,
             'reporter', json_build_object(
               'id', reporter.id, 'name', reporter.display_name),
             'createdAt', report.created_at
           ) ORDER BY report.created_at) AS reports
         FROM chat_reports report
         INNER JOIN users reporter ON reporter.id = report.reporter_id
         WHERE report.message_id = message.id AND report.status = 'PENDING'
       ) pending
       WHERE message.id IN (
           SELECT message_id FROM chat_reports WHERE status = 'PENDING')
         AND ($1::uuid IS NULL OR message.course_id = $1)
         AND ($3 OR ${managesCourseSql('$2')})
       ORDER BY pending.last DESC, message.id
       LIMIT ${CHAT_QUEUE_LIMIT}`,
      [courseId ?? null, principal.id, principal.roles.includes('admin')],
    );
    return rows.map((row) => ({
      message: chatMessageView(row),
      course: {
        id: row.courseId,
        title: row.courseTitle,
        slug: row.courseSlug,
      },
      reportCount: row.reportCount,
      lastReportedAt: row.lastReportedAt.toISOString(),
      reports: row.reports,
    }));
  }

  /**
   * The reports were unfounded: they are resolved and the message is
   * unflagged (FLAGGED -> ACTIVE). It never touches a hidden message.
   */
  async dismiss(principal: Principal, messageId: string, reason?: string) {
    return this.dataSource.transaction(async (manager) => {
      const message = await this.lockMessage(manager, messageId);
      await this.assertModerator(principal, message.courseId);
      // TypeORM answers UPDATE ... RETURNING with [rows, affectedCount].
      const [resolved] = await manager.query<[Array<{ id: string }>, number]>(
        `UPDATE chat_reports
         SET status = 'RESOLVED', resolved_by = $2, resolved_at = now()
         WHERE message_id = $1 AND status = 'PENDING'
         RETURNING id`,
        [messageId, principal.id],
      );
      let status = message.status;
      if (message.status === 'FLAGGED') {
        await manager.query(
          `UPDATE chat_messages SET status = 'ACTIVE' WHERE id = $1`,
          [messageId],
        );
        status = 'ACTIVE';
      }
      if (resolved.length)
        await manager.query(
          `INSERT INTO chat_moderation_logs
             (course_id, actor_id, action, message_id, reason, details)
           VALUES ($1, $2, 'DISMISS_REPORTS', $3, $4, $5)`,
          [
            message.courseId,
            principal.id,
            messageId,
            reason ?? null,
            { dismissedReports: resolved.length },
          ],
        );
      return { messageId, status, dismissedReports: resolved.length };
    });
  }

  /**
   * Suspends a learner's right to send in one course's room for a while.
   * Muting again replaces the deadline. Teachers of the course cannot be
   * muted, nor can moderators mute themselves.
   */
  async mute(principal: Principal, userId: string, dto: MuteChatUserDto) {
    await this.assertModerator(principal, dto.courseId);
    const [target] = await this.dataSource.query<Array<{ teaches: boolean }>>(
      `SELECT ${managesCourseSql('target.id')} AS teaches
       FROM users target
       INNER JOIN courses course ON course.id = $2
       WHERE target.id = $1`,
      [userId, dto.courseId],
    );
    if (!target) throw new NotFoundException(error(404, 'USER_NOT_FOUND'));
    if (target.teaches || userId === principal.id)
      throw new ForbiddenException(error(403, 'CHAT_MUTE_TARGET_FORBIDDEN'));

    const mutedUntil = await this.dataSource.transaction(async (manager) => {
      const [row] = await manager.query<Array<{ mutedUntil: Date }>>(
        `INSERT INTO chat_mutes(course_id, user_id, muted_by, muted_until, reason)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4), $5)
         ON CONFLICT (course_id, user_id) DO UPDATE SET
           muted_by = EXCLUDED.muted_by,
           muted_until = EXCLUDED.muted_until,
           reason = EXCLUDED.reason
         RETURNING muted_until AS "mutedUntil"`,
        [
          dto.courseId,
          userId,
          principal.id,
          dto.durationMinutes,
          dto.reason ?? null,
        ],
      );
      await manager.query(
        `INSERT INTO chat_moderation_logs
           (course_id, actor_id, action, target_user_id, reason, details)
         VALUES ($1, $2, 'MUTE_USER', $3, $4, $5)`,
        [
          dto.courseId,
          principal.id,
          userId,
          dto.reason ?? null,
          {
            mutedUntil: row.mutedUntil.toISOString(),
            durationMinutes: dto.durationMinutes,
          },
        ],
      );
      return row.mutedUntil.toISOString();
    });

    await this.broadcast(dto.courseId, ChatEvents.USER_MUTED, {
      userId,
      mutedUntil,
    });
    return { userId, courseId: dto.courseId, mutedUntil };
  }

  private async lockMessage(
    manager: EntityManager,
    messageId: string,
  ): Promise<MessageRow> {
    const [message] = await manager.query<MessageRow[]>(
      `SELECT course_id AS "courseId", sender_id AS "senderId", status
       FROM chat_messages WHERE id = $1 FOR UPDATE`,
      [messageId],
    );
    if (!message)
      throw new NotFoundException(error(404, 'CHAT_MESSAGE_NOT_FOUND'));
    return message;
  }

  private async assertModerator(principal: Principal, courseId: string) {
    const [course] = await this.dataSource.query<Array<{ teaches: boolean }>>(
      `SELECT ${managesCourseSql('$2')} AS teaches
       FROM courses course WHERE course.id = $1`,
      [courseId, principal.id],
    );
    if (!course) throw new NotFoundException(error(404, 'COURSE_NOT_FOUND'));
    if (!course.teaches && !principal.roles.includes('admin'))
      throw new ForbiddenException(error(403, 'CHAT_MODERATION_FORBIDDEN'));
  }

  /**
   * After commit, best effort: the change is already durable, and a client
   * that misses the event converges on its next sync (hidden messages drop
   * out of history; a muted send is refused by the API).
   */
  private async broadcast(courseId: string, event: string, data: unknown) {
    if (!this.realtime.isAvailable()) return;
    try {
      await this.realtime.publish(courseChannel(courseId), event, data);
    } catch (cause) {
      this.logger.warn({ event, courseId, error: (cause as Error).name });
    }
  }
}
