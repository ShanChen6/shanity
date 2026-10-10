import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';
import { Enrollment } from './enrollment.entity.js';
import { CourseStatus } from './course-status.js';
import { CourseAccessType } from './course-access-type.js';
import { CourseCurrency } from './course-currency.js';
import { bigintNumberTransformer } from '../database/bigint-number.transformer.js';
import { AuditedEntity } from '../database/audited.entity.js';

@Entity('courses')
@Index('courses_instructor_idx', ['instructorId'])
@Index('courses_status_published_at_idx', ['status', 'publishedAt'])
export class Course extends AuditedEntity {
  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'short_description', type: 'text', nullable: true })
  shortDescription: string | null;

  @Column({ type: 'text', nullable: true })
  thumbnail: string | null;

  @Column({ type: 'text', default: 'General' })
  category: string;

  @Column({ type: 'text', default: 'Beginner' })
  level: string;

  @Column({ type: 'text', default: 'vi' })
  language: string;

  @Column({
    name: 'access_type',
    type: 'enum',
    enum: CourseAccessType,
    enumName: 'CourseAccessType',
    default: CourseAccessType.FREE,
  })
  accessType: CourseAccessType;

  /** Percent of a live session's length that counts as attending it. */
  @Column({ name: 'live_attendance_threshold', type: 'smallint', default: 50 })
  liveAttendanceThreshold: number;

  // Raw minor units: VND integer, USD cents. FREE => 0, PAID => > 0 (DB CHECK).
  @Column({
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  price: number;

  @Column({
    type: 'varchar',
    length: 3,
    default: CourseCurrency.VND,
  })
  currency: CourseCurrency;

  // Students must complete each required lesson before opening later ones.
  @Column({ name: 'is_sequential', type: 'boolean', default: false })
  isSequential: boolean;

  @Column({
    type: 'enum',
    enum: CourseStatus,
    enumName: 'CourseStatus',
    default: CourseStatus.DRAFT,
  })
  status: CourseStatus;

  @Column({ name: 'instructor_id', type: 'uuid', nullable: true })
  instructorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'instructor_id',
    foreignKeyConstraintName: 'FK_courses_instructor',
  })
  instructor: User | null;

  // Ownership remains separate from the primary instructor and assignments.
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  // Publication stays single-sourced in `status`; this is the derived flag.
  get isPublished(): boolean {
    return this.status === CourseStatus.PUBLISHED;
  }

  @OneToMany(() => Chapter, (chapter) => chapter.course)
  chapters: Chapter[];

  @OneToMany(() => Enrollment, (enrollment) => enrollment.course)
  enrollments: Enrollment[];
}
