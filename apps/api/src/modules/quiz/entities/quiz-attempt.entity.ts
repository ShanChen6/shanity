import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../../users/user.entity.js';
import { QuizEntity } from './quiz.entity.js';
import { AttemptAnswerEntity } from './attempt-answer.entity.js';
import type { QuizAttemptSnapshot } from '../services/quiz-attempt-snapshot.js';
import { AuditedEntity } from '../../../database/audited.entity.js';

export enum QuizAttemptStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  // Committed while exactly one request grades the attempt.
  SUBMITTING = 'SUBMITTING',
  NEEDS_GRADING = 'NEEDS_GRADING',
  // Every essay graded and the final score stored, but still private.
  GRADED = 'GRADED',
  // Result published to the learner (published_at is set).
  COMPLETED = 'COMPLETED',
  // Legacy terminal values remain readable during the compatibility window.
  SUBMITTED = 'SUBMITTED',
  TIMED_OUT = 'TIMED_OUT',
  ABANDONED = 'ABANDONED',
}

@Entity('quiz_attempts')
@Index('IDX_quiz_attempts_user_quiz', ['userId', 'quizId', 'status'])
@Index('UQ_quiz_attempts_active', ['userId', 'quizId'], {
  unique: true,
  where: `status IN ('IN_PROGRESS', 'SUBMITTING')`,
})
@Unique('UQ_quiz_attempts_user_quiz_number', [
  'userId',
  'quizId',
  'attemptNumber',
])
export class QuizAttemptEntity extends AuditedEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_quiz_attempts_users',
  })
  user: Relation<User>;

  @Column({ name: 'quiz_id', type: 'uuid' })
  quizId: string;

  @ManyToOne(() => QuizEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'quiz_id',
    foreignKeyConstraintName: 'FK_quiz_attempts_quizzes',
  })
  quiz: Relation<QuizEntity>;

  @Column({ name: 'quiz_version', type: 'integer' })
  quizVersion: number;

  @Column({ name: 'attempt_number', type: 'smallint' })
  attemptNumber: number;

  // Frozen at start, answer key included: server-side only, never serialized
  // to learners as-is.
  @Column({ name: 'quiz_snapshot', type: 'jsonb' })
  quizSnapshot: QuizAttemptSnapshot;

  @Column({
    type: 'enum',
    enum: QuizAttemptStatus,
    enumName: 'QuizAttemptStatus',
    default: QuizAttemptStatus.IN_PROGRESS,
  })
  status: QuizAttemptStatus;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  // When the result became visible to the learner; null until published.
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  // Whole percentage, floor(percentage), so score >= passingScore exactly
  // when isPassed.
  @Column({ type: 'smallint', nullable: true })
  score: number | null;

  // Official result, set when the attempt closes.
  @Column({ name: 'earned_points', type: 'integer', nullable: true })
  earnedPoints: number | null;

  @Column({ name: 'total_points', type: 'integer', nullable: true })
  totalPoints: number | null;

  // earnedPoints * 100 / totalPoints, rounded half up to 2 decimals.
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  percentage: string | null;

  @Column({ name: 'is_passed', type: 'boolean', nullable: true })
  isPassed: boolean | null;

  @OneToMany(() => AttemptAnswerEntity, (answer) => answer.attempt)
  answers: Relation<AttemptAnswerEntity[]>;
}
