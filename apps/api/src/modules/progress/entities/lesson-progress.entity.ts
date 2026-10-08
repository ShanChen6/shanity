import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { Course } from '../../../courses/course.entity.js';
import { User } from '../../../users/user.entity.js';
import { Lesson } from '../../lessons/entities/lesson.entity.js';
import { AuditedEntity } from '../../../database/audited.entity.js';

export enum LessonProgressStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('lesson_progress')
@Unique('UQ_lesson_progress_user_lesson', ['userId', 'lessonId'])
@Index('idx_lesson_progress_user_course', ['userId', 'courseId'])
@Index('idx_lesson_progress_user_lesson', ['userId', 'lessonId'])
@Index('idx_lesson_progress_completed', ['userId', 'courseId', 'status'])
export class LessonProgress extends AuditedEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_lesson_progress_user',
  })
  user: Relation<User>;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @ManyToOne(() => Lesson, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'lesson_id',
    foreignKeyConstraintName: 'FK_lesson_progress_lesson',
  })
  lesson: Relation<Lesson>;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_lesson_progress_course',
  })
  course: Relation<Course>;

  @Column({
    type: 'enum',
    enum: LessonProgressStatus,
    enumName: 'LessonProgressStatus',
    default: LessonProgressStatus.IN_PROGRESS,
  })
  status: LessonProgressStatus;

  @Column({
    name: 'last_position',
    type: 'integer',
    nullable: true,
    default: 0,
  })
  lastPosition: number | null;

  @Column({
    name: 'started_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  startedAt: Date;

  @Column({
    name: 'last_accessed_at',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastAccessedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
