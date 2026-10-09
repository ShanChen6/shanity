import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PublicBlogQueryDto } from './blog.dto.js';
import { plainExcerpt, readingMinutes } from './blog-text.js';

export interface PublicPostCard {
  id: string;
  title: string;
  slug: string;
  /** The author's excerpt, or one derived from the content. */
  excerpt: string;
  coverImage: string | null;
  category: { name: string; slug: string } | null;
  author: { name: string; avatarUrl: string | null };
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
}

/** The course a post points readers to, as a sales card. */
export interface RelatedCourseCard {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  thumbnail: string | null;
  accessType: 'FREE' | 'PAID';
  /** Minor units (VND integer, USD cents). */
  price: number;
  currency: string;
  instructorName: string | null;
}

type CardRow = Omit<
  PublicPostCard,
  'excerpt' | 'readingMinutes' | 'publishedAt' | 'updatedAt'
> & {
  excerpt: string | null;
  lead: string;
  words: number;
  publishedAt: Date;
  updatedAt: Date;
};

const CARD_COLUMNS = `post.id, post.title, post.slug, post.excerpt,
  left(post.content, 1200) AS lead,
  coalesce(array_length(regexp_split_to_array(btrim(post.content), '\\s+'), 1), 0)
    AS words,
  post.cover_image AS "coverImage",
  CASE WHEN category.id IS NULL THEN NULL ELSE json_build_object(
    'name', category.name, 'slug', category.slug) END AS category,
  json_build_object('name', author.display_name,
    'avatarUrl', CASE WHEN author.avatar_key IS NULL THEN NULL
      ELSE '/avatars/' || author.avatar_key END) AS author,
  post.published_at AS "publishedAt", post.updated_at AS "updatedAt"`;
const FROM = `FROM posts post
  INNER JOIN users author ON author.id = post.author_id
  LEFT JOIN categories category ON category.id = post.category_id`;

function card(row: CardRow): PublicPostCard {
  const { lead, words, ...rest } = row;
  return {
    ...rest,
    excerpt: row.excerpt ?? plainExcerpt(lead),
    publishedAt: row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readingMinutes: readingMinutes(words),
  };
}

/**
 * The public blog: published posts only. Drafts, posts in review and hidden
 * ones do not exist here (404), whoever asks.
 */
@Injectable()
export class PublicBlogService {
  constructor(private readonly dataSource: DataSource) {}

  async list(query: PublicBlogQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where = `WHERE post.status = 'PUBLISHED'
      AND ($1::text IS NULL OR category.slug = $1)`;
    const params = [query.category ?? null];
    const [rows, [{ total }]] = await Promise.all([
      this.dataSource.query<CardRow[]>(
        `SELECT ${CARD_COLUMNS} ${FROM} ${where}
         ORDER BY post.published_at DESC, post.id
         LIMIT $2 OFFSET $3`,
        [...params, limit, (page - 1) * limit],
      ),
      this.dataSource.query<Array<{ total: number }>>(
        `SELECT count(*)::int AS total ${FROM} ${where}`,
        params,
      ),
    ]);
    return {
      items: rows.map(card),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }

  async get(slug: string) {
    const [row] = await this.dataSource.query<
      Array<CardRow & { content: string; linkedCourseId: string | null }>
    >(
      `SELECT ${CARD_COLUMNS}, post.content,
         post.linked_course_id AS "linkedCourseId"
       ${FROM}
       WHERE post.slug = $1 AND post.status = 'PUBLISHED'`,
      [slug],
    );
    if (!row)
      throw new NotFoundException({
        statusCode: 404,
        message: 'BLOG_POST_NOT_FOUND',
        code: 'BLOG_POST_NOT_FOUND',
      });
    const { content, linkedCourseId, ...rest } = row;
    return {
      post: { ...card(rest), content },
      relatedCourse: linkedCourseId
        ? await this.relatedCourse(linkedCourseId)
        : null,
    };
  }

  /** Every published post's address and last change, for sitemap.xml. */
  sitemap(): Promise<Array<{ slug: string; updatedAt: Date }>> {
    return this.dataSource.query(
      `SELECT slug, updated_at AS "updatedAt" FROM posts
       WHERE status = 'PUBLISHED'
       ORDER BY published_at DESC, id
       LIMIT 50000`,
    );
  }

  /** Only a published course is advertised; otherwise there is no card. */
  private async relatedCourse(id: string): Promise<RelatedCourseCard | null> {
    const [course] = await this.dataSource.query<
      Array<RelatedCourseCard & { price: string }>
    >(
      `SELECT course.id, course.title, course.slug,
         course.short_description AS "shortDescription",
         course.thumbnail, course.access_type AS "accessType",
         course.price, course.currency,
         instructor.display_name AS "instructorName"
       FROM courses course
       LEFT JOIN users instructor
         ON instructor.id = coalesce(course.instructor_id, course.owner_id)
       WHERE course.id = $1 AND course.status = 'published'`,
      [id],
    );
    return course ? { ...course, price: Number(course.price) } : null;
  }
}
