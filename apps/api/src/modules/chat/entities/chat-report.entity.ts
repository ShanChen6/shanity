import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from '../../../database/audited.entity.js';
import { User } from '../../../users/user.entity.js';
import { ChatMessage } from './chat-message.entity.js';

export enum ChatReportStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
}

/** A learner flagging a chat message for moderators; one per reporter. */
@Entity('chat_reports')
@Unique('UQ_chat_reports_message_reporter', ['messageId', 'reporterId'])
@Index('IDX_chat_reports_status_created', ['status', 'createdAt'])
@Index('IDX_chat_reports_reporter', ['reporterId'])
export class ChatReport extends AuditedEntity {
  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @ManyToOne(() => ChatMessage, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'message_id',
    foreignKeyConstraintName: 'FK_chat_reports_message',
  })
  message: Relation<ChatMessage>;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'reporter_id',
    foreignKeyConstraintName: 'FK_chat_reports_reporter',
  })
  reporter: Relation<User>;

  // CHECK: not blank.
  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: ChatReportStatus,
    enumName: 'ChatReportStatus',
    default: ChatReportStatus.PENDING,
  })
  status: ChatReportStatus;

  // Set together with status RESOLVED (CHK_chat_reports_resolution).
  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'resolved_by',
    foreignKeyConstraintName: 'FK_chat_reports_resolved_by',
  })
  resolver: Relation<User> | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
