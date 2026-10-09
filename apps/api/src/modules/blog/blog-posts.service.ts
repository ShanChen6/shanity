import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { uniqueViolation, type Principal } from '../../auth/auth.service.js';
import { slugify } from '../../common/slug.js';
import { managesCourseSql } from '../../courses/course-ownership.service.js';
import type {
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  UpdateBlogPostDto,
} from './blog.dto.js';
import { BlogPostStatus } from './entities/blog-post.entity.js';

const error = (statusCode: number, code: string, extra: object = {}) => ({
  statusCode,
  message: code,
  code,
  ...extra,
});
const notFound = () => new NotFoundException(error(404, 'BLOG_POST_NOT_FOUND'));

export interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  status: BlogPostStatus;
  author: { id: string; name: string; avatarUrl: string | null };
  category: { id: string; name: string; slug: string } | null;
  linkedCourse: { id: string; title: string; slug: string } | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  publishedAt: string | null;
}

export interface BlogPostDetail extends BlogPostSummary {
  content: string;
  /** The last editorial decision, with the note for the author. */
  review: {
    by: { id: string; name: string };
    at: string;
    note: string | null;
  } | null;
}

export interface BlogPostPage {
  items: BlogPostSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type Locked = {
  id: string;
  authorId: string;
  status: BlogPostStatus;
  content: string;
  categoryId: string | null;
  publishedAt: Date | null;
  submittedAt: Date | null;
};

const SUMMARY_COLUMNS = `post.id, post.title, post.slug, post.excerpt,
  post.cover_image AS "coverImage", post.status,
  json_build_object('id', author.id, 'name', author.display_name,
    'avatarUrl', CASE WHEN author.avatar_key IS NULL THEN NULL
      ELSE '/avatars/' || author.avatar_key END) AS author,
  CASE WHEN category.id IS NULL THEN NULL ELSE json_build_object(
    'id', category.id, 'name', category.name, 'slug', category.slug) END
    AS category,
  CASE WHEN course.id IS NULL THEN NULL ELSE json_build_object(
    'id', course.id, 'title', course.title, 'slug', course.slug) END
    AS "linkedCourse",
  post.created_at AS "createdAt", post.updated_at AS "updatedAt",
  post.submitted_at AS "submittedAt", post.published_at AS "publishedAt"`;
const FROM = `FROM posts post
  INNER JOIN users author ON author.id = post.author_id
  LEFT JOIN categories category ON category.id = post.category_id
  LEFT JOIN courses course ON course.id = post.linked_course_id`;

const iso = (value: Date | string | null) =>
  value === null ? null : new Date(value).toISOString();

type SummaryRow = Omit<
  BlogPostSummary,
  'createdAt' | 'updatedAt' | 'submittedAt' | 'publishedAt'
> & {
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  publishedAt: Date | null;
};

function summary(row: SummaryRow): BlogPostSummary {
  return {
    ...row,
    createdAt: iso(row.createdAt)!,
    updatedAt: iso(row.updatedAt)!,
    submittedAt: iso(row.submittedAt),
    publishedAt: iso(row.publishedAt),
  };
}

const isAdmin = (principal: Principal) => principal.roles.includes('admin');

/**
 * Authoring and the editorial workflow of the tech blog (docs/permissions.md):
 * instructors write and submit their own posts; admins also review, publish,
 * reject and hide anyone's. Every workflow step is audited in
 * post_review_logs, in the same transaction as the step.
 *
 * Posts are private to their author and admins until published: anyone else
 * gets 404, never a hint that a draft exists.
 */
@Injectable()
export class BlogPostsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(principal: Principal, dto: CreateBlogPostDto) {
    await this.checkReferences(principal, dto);
    const id = await this.withSlug(dto.slug, dto.title, (slug) =>
      this.dataSource
        .query<Array<{ id: string }>>(
          `INSERT INTO posts (author_id, title, slug, content, excerpt,
             cover_image, category_id, linked_course_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [
            principal.id,
            dto.title,
            slug,
            dto.content ?? '',
            dto.excerpt ?? null,
            dto.coverImage ?? null,
            dto.categoryId ?? null,
            dto.linkedCourseId ?? null,
          ],
        )
        .then(([row]) => row.id),
    );
    return this.get(principal, id);
  }

  async list(
    principal: Principal,
    query: ListBlogPostsQueryDto,
  ): Promise<BlogPostPage> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const onlyMine = !isAdmin(principal) || query.mine === true;
    const where = `WHERE ($1::uuid IS NULL OR post.author_id = $1)
      AND ($2::"BlogPostStatus" IS NULL OR post.status = $2)`;
    const params = [onlyMine ? principal.id : null, query.status ?? null];
    // The review queue reads oldest submission first; everything else by
    // most recent change.
    const order =
      query.status === BlogPostStatus.PENDING_REVIEW
        ? 'post.submitted_at ASC, post.id'
        : 'post.updated_at DESC, post.id';
    const [rows, [{ total }]] = await Promise.all([
      this.dataSource.query<SummaryRow[]>(
        `SELECT ${SUMMARY_COLUMNS} ${FROM} ${where}
         ORDER BY ${order} LIMIT $3 OFFSET $4`,
        [...params, limit, (page - 1) * limit],
      ),
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT count(*)::int AS total FROM posts post ${where}`,
        params,
      ),
    ]);
    return {
      items: rows.map(summary),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async get(principal: Principal, id: string): Promise<BlogPostDetail> {
    const [row] = await this.dataSource.query<
      Array<
        SummaryRow & {
          content: string;
          authorId: string;
          reviewedAt: Date | null;
          reviewNote: string | null;
          reviewer: { id: string; name: string } | null;
        }
      >
    >(
      `SELECT ${SUMMARY_COLUMNS}, post.content,
         post.author_id AS "authorId",
         post.reviewed_at AS "reviewedAt", post.review_note AS "reviewNote",
         CASE WHEN reviewer.id IS NULL THEN NULL ELSE json_build_object(
           'id', reviewer.id, 'name', reviewer.display_name) END AS reviewer
       ${FROM}
       LEFT JOIN users reviewer ON reviewer.id = post.reviewed_by
       WHERE post.id = $1`,
      [id],
    );
    if (!row || (row.authorId !== principal.id && !isAdmin(principal)))
      throw notFound();
    const {
      content,
      authorId: _author,
      reviewedAt,
      reviewNote,
      reviewer,
      ...rest
    } = row;
    return {
      ...summary(rest),
      content,
      review:
        reviewer && reviewedAt
          ? { by: reviewer, at: iso(reviewedAt)!, note: reviewNote }
          : null,
    };
  }

  /**
   * Authors edit their own drafts only; admins edit anything not archived.
   * Once a post was published its slug is part of the public web and stays.
   */
  async update(principal: Principal, id: string, dto: UpdateBlogPostDto) {
    await this.checkReferences(principal, dto);
    await this.dataSource.transaction(async (manager) => {
      const post = await this.lock(manager, principal, id);
      const editable = isAdmin(principal)
        ? post.status !== BlogPostStatus.ARCHIVED
        : post.status === BlogPostStatus.DRAFT;
      if (!editable)
        throw new ConflictException(
          error(409, 'BLOG_POST_NOT_EDITABLE', { status: post.status }),
        );
      if (dto.slug !== undefined && post.publishedAt)
        throw new ConflictException(error(409, 'BLOG_SLUG_FROZEN'));

      const columns: Record<string, unknown> = {
        title: dto.title,
        slug: dto.slug,
        content: dto.content,
        excerpt: dto.excerpt,
        cover_image: dto.coverImage,
        category_id: dto.categoryId,
        linked_course_id: dto.linkedCourseId,
      };
      const changes = Object.entries(columns).filter(
        ([, v]) => v !== undefined,
      );
      if (!changes.length) return;
      try {
        await manager.query(
          `UPDATE posts SET ${changes
            .map(([column], index) => `${column} = $${index + 2}`)
            .join(', ')} WHERE id = $1`,
          [id, ...changes.map(([, value]) => value)],
        );
      } catch (cause) {
        if (uniqueViolation(cause))
          throw new ConflictException(error(409, 'BLOG_SLUG_TAKEN'));
        throw cause;
      }
    });
    return this.get(principal, id);
  }

  /**
   * Only drafts that never entered review can be deleted: anything with a
   * review history is kept (and can be archived), so the audit stays whole.
   */
  async remove(principal: Principal, id: string) {
    await this.dataSource.transaction(async (manager) => {
      const post = await this.lock(manager, principal, id);
      if (post.status !== BlogPostStatus.DRAFT)
        throw new ConflictException(
          error(409, 'BLOG_POST_NOT_EDITABLE', { status: post.status }),
        );
      const [history] = await manager.query<Array<{ any: boolean }>>(
        `SELECT EXISTS (SELECT 1 FROM post_review_logs WHERE post_id = $1)
           AS any`,
        [id],
      );
      if (history?.any)
        throw new ConflictException(error(409, 'BLOG_POST_HAS_HISTORY'));
      await manager.query('DELETE FROM posts WHERE id = $1', [id]);
    });
  }

  /** Author: DRAFT -> PENDING_REVIEW, once the post is complete. */
  submit(principal: Principal, id: string) {
    return this.transition(principal, id, {
      from: [BlogPostStatus.DRAFT],
      to: BlogPostStatus.PENDING_REVIEW,
      authorOnly: true,
      requireComplete: true,
      set: 'submitted_at = now(), review_note = NULL',
    });
  }

  /** Author: PENDING_REVIEW -> DRAFT, to keep editing. */
  withdraw(principal: Principal, id: string) {
    return this.transition(principal, id, {
      from: [BlogPostStatus.PENDING_REVIEW],
      to: BlogPostStatus.DRAFT,
      authorOnly: true,
    });
  }

  /** Admin: PENDING_REVIEW -> PUBLISHED. First publication time is kept. */
  publish(principal: Principal, id: string, note?: string | null) {
    return this.transition(principal, id, {
      from: [BlogPostStatus.PENDING_REVIEW],
      to: BlogPostStatus.PUBLISHED,
      requireComplete: true,
      note,
      review: true,
      set: 'published_at = coalesce(published_at, now())',
    });
  }

  /** Admin: PENDING_REVIEW -> DRAFT, telling the author why. */
  reject(principal: Principal, id: string, note: string) {
    return this.transition(principal, id, {
      from: [BlogPostStatus.PENDING_REVIEW],
      to: BlogPostStatus.DRAFT,
      note,
      review: true,
    });
  }

  /** Admin: PUBLISHED -> HIDDEN, taking it off the public blog. */
  hide(principal: Principal, id: string, note?: string | null) {
    return this.transition(principal, id, {
      from: [BlogPostStatus.PUBLISHED],
      to: BlogPostStatus.HIDDEN,
      note,
      review: true,
    });
  }

  private async transition(
    principal: Principal,
    id: string,
    step: {
      from: BlogPostStatus[];
      to: BlogPostStatus;
      authorOnly?: boolean;
      requireComplete?: boolean;
      note?: string | null;
      /** An editorial decision: records reviewer, time and note. */
      review?: boolean;
      /** Further constant assignments. */
      set?: string;
    },
  ) {
    await this.dataSource.transaction(async (manager) => {
      const post = await this.lock(manager, principal, id);
      if (step.authorOnly && post.authorId !== principal.id)
        throw new ForbiddenException(error(403, 'BLOG_POST_AUTHOR_ONLY'));
      if (!step.from.includes(post.status))
        throw new ConflictException(
          error(409, 'BLOG_POST_INVALID_TRANSITION', {
            from: post.status,
            to: step.to,
          }),
        );
      if (step.requireComplete) {
        const missing = [
          ...(post.content.trim() ? [] : ['content']),
          ...(post.categoryId ? [] : ['categoryId']),
        ];
        if (missing.length)
          throw new UnprocessableEntityException(
            error(422, 'BLOG_POST_INCOMPLETE', { missing }),
          );
      }
      const note = step.note ?? null;
      const assignments = [
        'status = $2',
        ...(step.review
          ? ['reviewed_by = $3', 'reviewed_at = now()', 'review_note = $4']
          : []),
        ...(step.set ? [step.set] : []),
      ];
      await manager.query(
        `UPDATE posts SET ${assignments.join(', ')} WHERE id = $1`,
        step.review ? [id, step.to, principal.id, note] : [id, step.to],
      );
      await manager.query(
        `INSERT INTO post_review_logs
           (post_id, actor_id, from_status, to_status, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, principal.id, post.status, step.to, note],
      );
    });
    return this.get(principal, id);
  }

  /** Locks a post the caller may act on; 404 for anyone else's. */
  private async lock(
    manager: EntityManager,
    principal: Principal,
    id: string,
  ): Promise<Locked> {
    const [post] = await manager.query<Locked[]>(
      `SELECT id, author_id AS "authorId", status, content,
         category_id AS "categoryId", published_at AS "publishedAt",
         submitted_at AS "submittedAt"
       FROM posts WHERE id = $1 FOR UPDATE`,
      [id],
    );
    if (!post || (post.authorId !== principal.id && !isAdmin(principal)))
      throw notFound();
    return post;
  }

  /** The category must exist; instructors may only link courses they teach. */
  private async checkReferences(
    principal: Principal,
    dto: { categoryId?: string | null; linkedCourseId?: string | null },
  ) {
    if (dto.categoryId) {
      const [category] = await this.dataSource.query(
        'SELECT 1 FROM categories WHERE id = $1',
        [dto.categoryId],
      );
      if (!category)
        throw new BadRequestException(error(400, 'BLOG_CATEGORY_NOT_FOUND'));
    }
    if (dto.linkedCourseId) {
      const [course] = await this.dataSource.query<Array<{ teaches: boolean }>>(
        `SELECT ${managesCourseSql('$2')} AS teaches
         FROM courses course WHERE course.id = $1`,
        [dto.linkedCourseId, principal.id],
      );
      if (!course)
        throw new BadRequestException(error(400, 'BLOG_COURSE_NOT_FOUND'));
      if (!course.teaches && !isAdmin(principal))
        throw new ForbiddenException(error(403, 'BLOG_COURSE_NOT_ALLOWED'));
    }
  }

  /**
   * Runs `insert` with a free slug. An explicit slug must be free; one
   * derived from the title gets -2, -3, ... appended until it is.
   */
  private async withSlug<T>(
    explicit: string | undefined,
    title: string,
    insert: (slug: string) => Promise<T>,
  ): Promise<T> {
    if (explicit)
      return insert(explicit).catch((cause: unknown) => {
        if (uniqueViolation(cause))
          throw new ConflictException(error(409, 'BLOG_SLUG_TAKEN'));
        throw cause;
      });
    const base = slugify(title).slice(0, 190).replace(/-+$/, '');
    for (let attempt = 0; attempt < 5; attempt++) {
      const [{ slug }] = await this.dataSource.query<Array<{ slug: string }>>(
        `SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM posts WHERE slug = $1)
           THEN $1 ELSE $1 || '-' || (
             SELECT coalesce(max(substring(slug FROM '-([0-9]+)$')::int), 1) + 1
             FROM posts WHERE slug ~ ('^' || $1 || '-[0-9]+$')) END AS slug`,
        [base],
      );
      try {
        return await insert(slug);
      } catch (cause) {
        // Someone took it in between: look again.
        if (!uniqueViolation(cause)) throw cause;
      }
    }
    throw new ConflictException(error(409, 'BLOG_SLUG_TAKEN'));
  }
}
