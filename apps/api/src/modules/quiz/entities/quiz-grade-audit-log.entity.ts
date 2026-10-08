import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { EssayRubricScore } from '../domain/assessment.types.js';
import { User } from '../../../users/user.entity.js';
import { AttemptAnswerEntity } from './attempt-answer.entity.js';
import { QuizAttemptEntity } from './quiz-attempt.entity.js';

const decimal = {
  type: 'numeric' as const,
  precision: 7,
  scale: 2,
  transformer: { to: (value: number) => value, from: (v: string) => Number(v) },
};

/**
 * One adjustment of an essay grade that had already been given. Append-only:
 * the database refuses to update, delete or truncate these rows.
 */
@Entity('quiz_grade_audit_logs')
@Index('IDX_quiz_grade_audit_logs_attempt', ['attemptId', 'createdAt'])
@Index('IDX_quiz_grade_audit_logs_answer', ['quizAnswerId', 'createdAt'])
export class QuizGradeAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'quiz_answer_id', type: 'uuid' })
  quizAnswerId: string;

  @ManyToOne(() => AttemptAnswerEntity, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'quiz_answer_id',
    foreignKeyConstraintName: 'FK_quiz_grade_audit_logs_attempt_answers',
  })
  quizAnswer: Relation<AttemptAnswerEntity>;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @ManyToOne(() => QuizAttemptEntity, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'attempt_id',
    foreignKeyConstraintName: 'FK_quiz_grade_audit_logs_quiz_attempts',
  })
  attempt: Relation<QuizAttemptEntity>;

  // A snapshot identity, not an FK: authoring rows may be edited or removed.
  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @Column({ name: 'adjusted_by', type: 'uuid' })
  adjustedBy: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'adjusted_by',
    foreignKeyConstraintName: 'FK_quiz_grade_audit_logs_users',
  })
  adjuster: Relation<User>;

  @Column({ name: 'old_score', ...decimal })
  oldScore: number;

  @Column({ name: 'new_score', ...decimal })
  newScore: number;

  @Column({ name: 'old_feedback', type: 'text', nullable: true })
  oldFeedback: string | null;

  @Column({ name: 'new_feedback', type: 'text', nullable: true })
  newFeedback: string | null;

  @Column({ name: 'old_rubric_scores', type: 'jsonb', nullable: true })
  oldRubricScores: EssayRubricScore[] | null;

  @Column({ name: 'new_rubric_scores', type: 'jsonb', nullable: true })
  newRubricScores: EssayRubricScore[] | null;

  // Required once the learner could see the result (`wasPublished`).
  @Column({ name: 'adjustment_reason', type: 'text', nullable: true })
  adjustmentReason: string | null;

  @Column({ name: 'was_published', type: 'boolean', default: false })
  wasPublished: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
