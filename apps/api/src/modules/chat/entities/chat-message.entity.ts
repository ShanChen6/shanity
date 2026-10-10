import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from '../../../database/audited.entity.js';
import { Course } from '../../../courses/course.entity.js';
import { User } from '../../../users/user.entity.js';

export enum ChatMessageStatus {
  ACTIVE = 'ACTIVE',
  /** Removed from the room by a moderator; kept for the audit trail. */
  HIDDEN = 'HIDDEN',
  /** Reported and awaiting moderator review; still visible. */
  FLAGGED = 'FLAGGED',
}

export interface ChatAttachment {
  /** Storage object key, never a public URL. */
  key: string;
  name: string;
  mimeType: string;
  size: number;
}

/**
 * One message in a course's group chat. The database requires text or at
 * least one attachment (CHK_chat_messages_not_empty).
 */
@Entity('chat_messages')
@Index('IDX_chat_messages_course_created', ['courseId', 'createdAt', 'id'])
@Index('IDX_chat_messages_sender', ['senderId'])
export class ChatMessage extends AuditedEntity {
  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_chat_messages_course',
  })
  course: Relation<Course>;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'sender_id',
    foreignKeyConstraintName: 'FK_chat_messages_sender',
  })
  sender: Relation<User>;

  @Column({ type: 'text', default: '' })
  content: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments: ChatAttachment[];

  @Column({
    type: 'enum',
    enum: ChatMessageStatus,
    enumName: 'ChatMessageStatus',
    default: ChatMessageStatus.ACTIVE,
  })
  status: ChatMessageStatus;
}
