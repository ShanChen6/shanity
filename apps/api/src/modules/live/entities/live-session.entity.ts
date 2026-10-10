import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import type { Relation } from 'typeorm';
import { AuditedEntity } from '../../../database/audited.entity.js';
import { Course } from '../../../courses/course.entity.js';
import { User } from '../../../users/user.entity.js';

export enum LiveSessionProvider {
  YOUTUBE = 'YOUTUBE',
  VIMEO = 'VIMEO',
  JITSI = 'JITSI',
  /** Any https host the operator allowed (LIVE_EMBED_ALLOWED_HOSTS). */
  CUSTOM_EMBED = 'CUSTOM_EMBED',
}

/**
 * Stored: SCHEDULED, or what the clock cannot tell (CANCELLED, ENDED early).
 * Read: the effective status, with LIVE/ENDED derived from the window.
 */
export enum LiveSessionStatus {
  SCHEDULED = 'SCHEDULED',
  LIVE = 'LIVE',
  ENDED = 'ENDED',
  CANCELLED = 'CANCELLED',
}

/** A scheduled live class of a course, played through an embedded stream. */
@Entity('live_sessions')
@Index('IDX_live_sessions_course_start', ['courseId', 'startTime'])
export class LiveSession extends AuditedEntity {
  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_live_sessions_course',
  })
  course: Relation<Course>;

  @Column({ name: 'instructor_id', type: 'uuid' })
  instructorId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'instructor_id',
    foreignKeyConstraintName: 'FK_live_sessions_instructor',
  })
  instructor: Relation<User>;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime: Date;

  /** Already in the provider's embed form (https only, CHECK). */
  @Column({ name: 'embed_url', type: 'text' })
  embedUrl: string;

  @Column({
    type: 'enum',
    enum: LiveSessionProvider,
    enumName: 'LiveSessionProvider',
  })
  provider: LiveSessionProvider;

  @Column({
    type: 'enum',
    enum: LiveSessionStatus,
    enumName: 'LiveSessionStatus',
    default: LiveSessionStatus.SCHEDULED,
  })
  status: LiveSessionStatus;
}
