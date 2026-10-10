import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from '../../../database/audited.entity.js';
import { User } from '../../../users/user.entity.js';
import { BlogPost } from './blog-post.entity.js';

export enum CommentStatus {
  /** Public. */
  APPROVED = 'APPROVED',
  /** Waiting for an admin; visible to its author only. */
  PENDING = 'PENDING',
  /** Never shown. Kept with its reason for review. */
  REJECTED = 'REJECTED',
}

/** What the moderation pipeline recorded when it decided. */
export interface CommentModerationRecord {
  /** Which layer decided: 1 rules, 2 AI, 3 trust (or 'admin'). */
  decidedBy?: 'rules' | 'ai' | 'trust' | 'admin';
  rule?: string;
  provider?: string;
  categories?: Record<string, number>;
  trust?: Record<string, unknown>;
}

/** A comment on a blog post. `isApproved` mirrors status (CHECK). */
@Entity('post_comments')
@Index('IDX_post_comments_post_approved', ['postId', 'createdAt', 'id'], {
  where: `status = 'APPROVED'`,
})
@Index('IDX_post_comments_pending', ['createdAt'], {
  where: `status = 'PENDING'`,
})
@Index('IDX_post_comments_author', ['authorId', 'status', 'createdAt'])
export class PostComment extends AuditedEntity {
  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => BlogPost, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'post_id',
    foreignKeyConstraintName: 'FK_post_comments_post',
  })
  post: Relation<BlogPost>;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'author_id',
    foreignKeyConstraintName: 'FK_post_comments_author',
  })
  author: Relation<User>;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: CommentStatus, enumName: 'CommentStatus' })
  status: CommentStatus;

  @Column({ name: 'is_approved', type: 'boolean' })
  isApproved: boolean;

  /** 0..1 from the AI layer; null when it did not run or could not answer. */
  @Column({ name: 'toxicity_score', type: 'real', nullable: true })
  toxicityScore: number | null;

  /** A stable code (SPAM_LINK, TOXIC, SUSPICIOUS, ...) or an admin's note. */
  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  moderation: CommentModerationRecord;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({
    name: 'reviewed_by',
    foreignKeyConstraintName: 'FK_post_comments_reviewed_by',
  })
  reviewer: Relation<User> | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;
}
