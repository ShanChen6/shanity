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
import { CommentStatus, PostComment } from './post-comment.entity.js';

/** Append-only audit of admins' manual comment decisions. */
@Entity('post_comment_review_logs')
@Index('IDX_post_comment_review_logs_comment', ['commentId', 'createdAt'])
export class PostCommentReviewLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'comment_id', type: 'uuid' })
  commentId: string;

  @ManyToOne(() => PostComment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'comment_id',
    foreignKeyConstraintName: 'FK_post_comment_review_logs_comment',
  })
  comment: Relation<PostComment>;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'actor_id',
    foreignKeyConstraintName: 'FK_post_comment_review_logs_actor',
  })
  actor: Relation<User>;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: CommentStatus,
    enumName: 'CommentStatus',
  })
  fromStatus: CommentStatus;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: CommentStatus,
    enumName: 'CommentStatus',
  })
  toStatus: CommentStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
