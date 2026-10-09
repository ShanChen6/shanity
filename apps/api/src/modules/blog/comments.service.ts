import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { Principal } from '../../auth/auth.service.js';
import { RateLimiter } from '../../cache/rate-limiter.js';
import type { AdminCommentQueryDto } from './blog.dto.js';
import { CommentStatus } from './entities/post-comment.entity.js';
import {
  CommentModerationService,
  type ModerationReason,
} from './moderation/comment-moderation.service.js';

/** Comment flood control per user, before any AI call is spent. */
export const COMMENT_LIMIT = 5;
export const COMMENT_WINDOW_MS = 60_000;
/** The same text again on the same post within this span is a duplicate. */
const DUPLICATE_WINDOW = '24 hours';
const PAGE_SIZE = 50;

const error = (statusCode: number, code: string) => ({
  statusCode,
  message: code,
  code,
});

export interface CommentView {
  id: string;
  content: string;
  status: CommentStatus;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
}

/** What the author is told about their comment, in their language. */
export const OUTCOME_MESSAGES: Record<CommentStatus, string> = {
  APPROVED: 'Bình luận của bạn đã được đăng.',
  PENDING: 'Bình luận của bạn đang chờ kiểm duyệt.',
  REJECTED: 'Bình luận vi phạm quy chuẩn nội dung nên không được đăng.',
};
/** Rejections the author can fix get a hint. */
const REJECTION_HINTS: Partial<Record<ModerationReason, string>> = {
  SPAM_LINK: 'Vui lòng không chèn liên kết ngoài.',
  CONTACT_INFO: 'Vui lòng không chia sẻ số điện thoại, Zalo hay Telegram.',
  PROFANITY: 'Vui lòng dùng ngôn từ lịch sự.',
  REPEATED_TEXT: 'Vui lòng không lặp lại ký tự hoặc từ ngữ.',
  DUPLICATE: 'Bạn đã gửi bình luận này rồi.',
};

type Row = Omit<CommentView, 'createdAt'> & { createdAt: Date };
const COLUMNS = `comment.id, comment.content, comment.status,
  comment.created_at AS "createdAt",
  json_build_object('id', author.id, 'name', author.display_name,
    'avatarUrl', CASE WHEN author.avatar_key IS NULL THEN NULL
      ELSE '/avatars/' || author.avatar_key END) AS author`;
const view = (row: Row): CommentView => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Blog comments: submission through the moderation pipeline, the public
 * thread, and admins' review of what the pipeline held back.
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly moderation: CommentModerationService,
    private readonly limiter: RateLimiter,
  ) {}

  async submit(principal: Principal, slug: string, content: string) {
    const postId = await this.publishedPostId(slug);
    const { allowed, retryAfterMs } = await this.limiter.consume(
      `comment:${principal.id}`,
      COMMENT_LIMIT,
      COMMENT_WINDOW_MS,
    );
    if (!allowed)
      throw new HttpException(
        { ...error(429, 'COMMENT_RATE_LIMITED'), retryAfterMs },
        HttpStatus.TOO_MANY_REQUESTS,
      );

    const [profile] = await this.dataSource.query<
      Array<{
        ageMs: number;
        enrolled: boolean;
        approved: number;
        duplicate: boolean;
      }>
    >(
      `SELECT extract(epoch FROM now() - member.created_at) * 1000 AS "ageMs",
         EXISTS (SELECT 1 FROM enrollments e
                 WHERE e.user_id = member.id AND e.revoked_at IS NULL) AS enrolled,
         (SELECT count(*)::int FROM post_comments c
          WHERE c.author_id = member.id AND c.status = 'APPROVED') AS approved,
         EXISTS (SELECT 1 FROM post_comments c
                 WHERE c.author_id = member.id AND c.post_id = $2
                   AND lower(btrim(c.content)) = lower(btrim($3))
                   AND c.created_at > now() - interval '${DUPLICATE_WINDOW}')
           AS duplicate
       FROM users member WHERE member.id = $1`,
      [principal.id, postId, content],
    );
    const decision = await this.moderation.moderate(content, {
      roles: principal.roles,
      accountAgeMs: Number(profile.ageMs),
      enrolled: profile.enrolled,
      approvedComments: profile.approved,
      duplicate: profile.duplicate,
    });

    const [row] = await this.dataSource.query<Row[]>(
      `WITH comment AS (
         INSERT INTO post_comments (post_id, author_id, content, status,
           is_approved, toxicity_score, rejection_reason, moderation)
         VALUES ($1, $2, $3, $4, $8, $5, $6, $7)
         RETURNING *)
       SELECT ${COLUMNS} FROM comment
       INNER JOIN users author ON author.id = comment.author_id`,
      [
        postId,
        principal.id,
        content,
        decision.status,
        decision.toxicityScore,
        decision.reason,
        decision.record,
        decision.status === CommentStatus.APPROVED,
      ],
    );
    const hint =
      decision.status === CommentStatus.REJECTED && decision.reason
        ? REJECTION_HINTS[decision.reason]
        : undefined;
    return {
      comment: view(row),
      status: decision.status,
      reason: decision.reason,
      message: hint
        ? `${OUTCOME_MESSAGES[decision.status]} ${hint}`
        : OUTCOME_MESSAGES[decision.status],
    };
  }

  /**
   * The public thread (approved, oldest first). A signed-in viewer also
   * gets their own comments still waiting for review; nobody else does.
   */
  async list(slug: string, viewerId: string | null, page = 1) {
    const postId = await this.publishedPostId(slug);
    const [rows, [{ total }], pending] = await Promise.all([
      this.dataSource.query<Row[]>(
        `SELECT ${COLUMNS} FROM post_comments comment
         INNER JOIN users author ON author.id = comment.author_id
         WHERE comment.post_id = $1 AND comment.status = 'APPROVED'
         ORDER BY comment.created_at, comment.id
         LIMIT $2 OFFSET $3`,
        [postId, PAGE_SIZE, (page - 1) * PAGE_SIZE],
      ),
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT count(*)::int AS total FROM post_comments
         WHERE post_id = $1 AND status = 'APPROVED'`,
        [postId],
      ),
      viewerId
        ? this.dataSource.query<Row[]>(
            `SELECT ${COLUMNS} FROM post_comments comment
             INNER JOIN users author ON author.id = comment.author_id
             WHERE comment.post_id = $1 AND comment.author_id = $2
               AND comment.status = 'PENDING'
             ORDER BY comment.created_at, comment.id`,
            [postId, viewerId],
          )
        : Promise.resolve([]),
    ]);
    return {
      comments: rows.map(view),
      pending: pending.map(view),
      page,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  }

  /** The admin queue: PENDING by default, oldest first. */
  async queue(query: AdminCommentQueryDto) {
    const status = query.status ?? CommentStatus.PENDING;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [rows, [{ total }]] = await Promise.all([
      this.dataSource.query(
        `SELECT ${COLUMNS},
           comment.toxicity_score AS "toxicityScore",
           comment.rejection_reason AS "rejectionReason",
           comment.moderation,
           json_build_object('id', post.id, 'title', post.title,
             'slug', post.slug) AS post
         FROM post_comments comment
         INNER JOIN users author ON author.id = comment.author_id
         INNER JOIN posts post ON post.id = comment.post_id
         WHERE comment.status = $1
         ORDER BY comment.created_at ${status === 'PENDING' ? 'ASC' : 'DESC'},
           comment.id
         LIMIT $2 OFFSET $3`,
        [status, limit, (page - 1) * limit],
      ),
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT count(*)::int AS total FROM post_comments WHERE status = $1`,
        [status],
      ),
    ]);
    return {
      items: (rows as Array<Row & Record<string, unknown>>).map((row) => ({
        ...row,
        ...view(row),
      })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  approve(admin: Principal, id: string, reason?: string | null) {
    return this.decide(admin, id, CommentStatus.APPROVED, reason ?? null);
  }

  reject(admin: Principal, id: string, reason?: string | null) {
    return this.decide(admin, id, CommentStatus.REJECTED, reason ?? null);
  }

  /** An admin overrides the pipeline either way; audited. */
  private async decide(
    admin: Principal,
    id: string,
    to: CommentStatus,
    reason: string | null,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const [comment] = await manager.query<Array<{ status: CommentStatus }>>(
        'SELECT status FROM post_comments WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!comment)
        throw new NotFoundException(error(404, 'COMMENT_NOT_FOUND'));
      if (comment.status === to)
        throw new ConflictException(error(409, `COMMENT_ALREADY_${to}`));
      await manager.query(
        `UPDATE post_comments SET status = $2, is_approved = $5,
           rejection_reason = $3, reviewed_by = $4, reviewed_at = now(),
           moderation = moderation || '{"decidedBy": "admin"}'::jsonb
         WHERE id = $1`,
        [
          id,
          to,
          to === CommentStatus.REJECTED ? (reason ?? 'ADMIN_REJECTED') : null,
          admin.id,
          to === CommentStatus.APPROVED,
        ],
      );
      await manager.query(
        `INSERT INTO post_comment_review_logs
           (comment_id, actor_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, admin.id, comment.status, to, reason],
      );
      return { id, status: to };
    });
  }

  private async publishedPostId(slug: string): Promise<string> {
    const [post] = await this.dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM posts WHERE slug = $1 AND status = 'PUBLISHED'`,
      [slug],
    );
    if (!post) throw new NotFoundException(error(404, 'BLOG_POST_NOT_FOUND'));
    return post.id;
  }
}
