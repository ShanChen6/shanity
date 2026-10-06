import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum LessonProgressStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('lesson_progress')
@Unique('UQ_lesson_progress_user_lesson', ['userId', 'lessonId'])
@Index('lesson_progress_course_user_idx', ['courseId', 'userId'])
export class LessonProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({
    type: 'enum',
    enum: LessonProgressStatus,
    enumName: 'LessonProgressStatus',
    default: LessonProgressStatus.NOT_STARTED,
  })
  status: LessonProgressStatus;

  @Column({ name: 'last_position', type: 'integer', default: 0 })
  lastPosition: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
