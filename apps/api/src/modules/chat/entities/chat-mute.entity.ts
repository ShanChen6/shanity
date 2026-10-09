import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from '../../../database/audited.entity.js';
import { Course } from '../../../courses/course.entity.js';
import { User } from '../../../users/user.entity.js';

/**
 * A user may not send in one course's room until `mutedUntil`. One row per
 * (course, user): muting again replaces the deadline. Expired rows are inert.
 */
@Entity('chat_mutes')
@Unique('UQ_chat_mutes_course_user', ['courseId', 'userId'])
export class ChatMute extends AuditedEntity {
  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_chat_mutes_course',
  })
  course: Relation<Course>;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_chat_mutes_user',
  })
  user: Relation<User>;

  @Column({ name: 'muted_by', type: 'uuid' })
  mutedBy: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'muted_by',
    foreignKeyConstraintName: 'FK_chat_mutes_muted_by',
  })
  moderator: Relation<User>;

  @Column({ name: 'muted_until', type: 'timestamptz' })
  mutedUntil: Date;

  // CHECK: null or not blank.
  @Column({ type: 'text', nullable: true })
  reason: string | null;
}
