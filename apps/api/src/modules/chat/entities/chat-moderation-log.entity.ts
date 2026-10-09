import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Course } from '../../../courses/course.entity.js';
import { User } from '../../../users/user.entity.js';
import { ChatMessage } from './chat-message.entity.js';

export enum ChatModerationAction {
  /** `messageId` set. */
  HIDE_MESSAGE = 'HIDE_MESSAGE',
  /** `messageId` set: its reports were judged unfounded, the message stays. */
  DISMISS_REPORTS = 'DISMISS_REPORTS',
  /** `targetUserId` set; `details.mutedUntil` the deadline given. */
  MUTE_USER = 'MUTE_USER',
}

/**
 * Append-only audit of moderation in course chats. The database refuses to
 * update, delete or truncate these rows.
 */
@Entity('chat_moderation_logs')
@Index('IDX_chat_moderation_logs_course_created', ['courseId', 'createdAt'])
export class ChatModerationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_chat_moderation_logs_course',
  })
  course: Relation<Course>;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'actor_id',
    foreignKeyConstraintName: 'FK_chat_moderation_logs_actor',
  })
  actor: Relation<User>;

  @Column({
    type: 'enum',
    enum: ChatModerationAction,
    enumName: 'ChatModerationAction',
  })
  action: ChatModerationAction;

  @Column({ name: 'message_id', type: 'uuid', nullable: true })
  messageId: string | null;

  @ManyToOne(() => ChatMessage, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'message_id',
    foreignKeyConstraintName: 'FK_chat_moderation_logs_message',
  })
  message: Relation<ChatMessage> | null;

  @Column({ name: 'target_user_id', type: 'uuid', nullable: true })
  targetUserId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'target_user_id',
    foreignKeyConstraintName: 'FK_chat_moderation_logs_target_user',
  })
  targetUser: Relation<User> | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
