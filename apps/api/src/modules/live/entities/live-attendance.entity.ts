import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from '../../../database/audited.entity.js';
import { User } from '../../../users/user.entity.js';
import { LiveSession } from './live-session.entity.js';

/**
 * A student's presence in one live session, credited only by the API from
 * accepted heartbeats (never set by the client).
 */
@Entity('live_attendances')
@Unique('UQ_live_attendances_session_student', ['sessionId', 'studentId'])
@Index('IDX_live_attendances_student', ['studentId'])
export class LiveAttendance extends AuditedEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => LiveSession, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'session_id',
    foreignKeyConstraintName: 'FK_live_attendances_session',
  })
  session: Relation<LiveSession>;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'student_id',
    foreignKeyConstraintName: 'FK_live_attendances_student',
  })
  student: Relation<User>;

  @Column({ name: 'duration_seconds', type: 'integer', default: 0 })
  durationSeconds: number;

  @Column({ name: 'is_attended', type: 'boolean', default: false })
  isAttended: boolean;

  @Column({
    name: 'first_joined_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  firstJoinedAt: Date;

  @Column({
    name: 'last_active_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastActiveAt: Date;
}
