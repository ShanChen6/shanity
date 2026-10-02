import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';
import { Chapter } from './chapter.entity.js';
import { Enrollment } from './enrollment.entity.js';
import { CourseStatus } from './course-status.js';

@Entity('courses')
@Index('courses_instructor_idx', ['instructorId'])
@Index('courses_status_published_at_idx', ['status', 'publishedAt'])
export class Course {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  // PostgreSQL's trigger updates this for ORM and direct SQL writes.
  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;

  @OneToMany(() => Chapter, (chapter) => chapter.course)
  chapters: Chapter[];

  @OneToMany(() => Enrollment, (enrollment) => enrollment.course)
  enrollments: Enrollment[];
}
