import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from '../../../database/audited.entity.js';
import { Course } from '../../../courses/course.entity.js';
import { User } from '../../../users/user.entity.js';
import { BlogCategory } from './blog-category.entity.js';

/**
 * Editorial workflow, enforced by the posts_guard_update trigger:
 * DRAFT -> PENDING_REVIEW -> PUBLISHED; PENDING_REVIEW -> DRAFT (rejected or
 * withdrawn); PUBLISHED <-> HIDDEN; anything -> ARCHIVED.
 */
export enum BlogPostStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  PUBLISHED = 'PUBLISHED',
  /** Taken down by an admin after publication. */
  HIDDEN = 'HIDDEN',
  ARCHIVED = 'ARCHIVED',
}

/** A tech blog article (the foundation's `posts` table). */
@Entity('posts')
@Unique('posts_slug_key', ['slug'])
@Index('IDX_posts_published', ['publishedAt', 'id'], {
  where: `status = 'PUBLISHED'`,
})
@Index('IDX_posts_category_published', ['categoryId', 'publishedAt'], {
  where: `status = 'PUBLISHED'`,
})
@Index('IDX_posts_author_updated', ['authorId', 'updatedAt'])
@Index('IDX_posts_review_queue', ['submittedAt'], {
  where: `status = 'PENDING_REVIEW'`,
})
@Index('IDX_posts_linked_course', ['linkedCourseId'], {
  where: 'linked_course_id IS NOT NULL',
})
export class BlogPost extends AuditedEntity {
  @Column({ type: 'text' })
  title: string;

  /** Frozen once the post was first published (trigger). */
  @Column({ type: 'text' })
  slug: string;

  /** Markdown with KaTeX math; rendered (and sanitized) by the reader. */
  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'text', nullable: true })
  excerpt: string | null;

  @Column({ name: 'cover_image', type: 'text', nullable: true })
  coverImage: string | null;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'author_id',
    foreignKeyConstraintName: 'posts_author_id_fkey',
  })
  author: Relation<User>;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => BlogCategory, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'category_id',
    foreignKeyConstraintName: 'FK_posts_category',
  })
  category: Relation<BlogCategory> | null;

  @Column({ name: 'linked_course_id', type: 'uuid', nullable: true })
  linkedCourseId: string | null;

  @ManyToOne(() => Course, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'linked_course_id',
    foreignKeyConstraintName: 'FK_posts_linked_course',
  })
  linkedCourse: Relation<Course> | null;

  @Column({
    type: 'enum',
    enum: BlogPostStatus,
    enumName: 'BlogPostStatus',
    default: BlogPostStatus.DRAFT,
  })
  status: BlogPostStatus;

  /** When it last entered review. */
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  /** The last editorial decision (publish, reject, hide). */
  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reviewed_by',
    foreignKeyConstraintName: 'FK_posts_reviewed_by',
  })
  reviewer: Relation<User> | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** Why it was sent back, for the author. */
  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  /** First publication; frozen afterwards (trigger). */
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;
}
