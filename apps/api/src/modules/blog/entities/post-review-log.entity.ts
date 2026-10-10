import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../../users/user.entity.js';
import { BlogPost, BlogPostStatus } from './blog-post.entity.js';

/**
 * Append-only audit of every workflow step of a post. The database refuses
 * to update, delete or truncate these rows.
 */
@Entity('post_review_logs')
@Index('IDX_post_review_logs_post', ['postId', 'createdAt'])
export class PostReviewLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', type: 'uuid' })
  postId: string;

  @ManyToOne(() => BlogPost, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'post_id',
    foreignKeyConstraintName: 'FK_post_review_logs_post',
  })
  post: Relation<BlogPost>;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'actor_id',
    foreignKeyConstraintName: 'FK_post_review_logs_actor',
  })
  actor: Relation<User>;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: BlogPostStatus,
    enumName: 'BlogPostStatus',
  })
  fromStatus: BlogPostStatus;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: BlogPostStatus,
    enumName: 'BlogPostStatus',
  })
  toStatus: BlogPostStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
