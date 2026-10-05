import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Course } from './course.entity.js';
import { User } from '../users/user.entity.js';

@Entity('enrollments')
@Unique('enrollments_user_id_course_id_key', ['userId', 'courseId'])
@Index('enrollments_user_idx', ['userId'])
@Index('enrollments_course_idx', ['courseId'])
export class Enrollment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, (user) => user.enrollments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_enrollments_user',
  })
  user: Relation<User>;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, (course) => course.enrollments, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_enrollments_course',
  })
  course: Relation<Course>;

  @Column({ name: 'enrolled_at', type: 'timestamptz', default: () => 'now()' })
  enrolledAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
