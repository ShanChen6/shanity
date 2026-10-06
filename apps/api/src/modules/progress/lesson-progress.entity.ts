import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

export enum ProgressStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

@Entity('lesson_progress')
@Unique('lesson_progress_user_lesson_key', ['userId', 'lessonId'])
@Index('lesson_progress_course_user_idx', ['courseId', 'userId'])
export class LessonProgress {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'lesson_id', type: 'uuid' })
  lessonId: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @Column({ type: 'enum', enum: ProgressStatus, enumName: 'ProgressStatus' })
  status: ProgressStatus;

  @Column({ name: 'last_position', type: 'integer', default: 0 })
  lastPosition: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
