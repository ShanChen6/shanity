import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { QuizAttemptEntity } from './quiz-attempt.entity.js';

@Entity('attempt_answers')
@Index('IDX_attempt_answers_attempt_question', ['attemptId', 'questionId'], {
  unique: true,
})
export class AttemptAnswerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'attempt_id', type: 'uuid' })
  attemptId: string;

  @ManyToOne(() => QuizAttemptEntity, (attempt) => attempt.answers, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'attempt_id',
    foreignKeyConstraintName: 'FK_attempt_answers_quiz_attempts',
  })
  attempt: Relation<QuizAttemptEntity>;

  // Ids from the attempt's snapshot, not FKs to the live authoring rows.
  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  // One id for SINGLE_CHOICE, a set for MULTIPLE_CHOICE; empty = unanswered.
  @Column({
    name: 'selected_option_ids',
    type: 'uuid',
    array: true,
    default: () => `'{}'`,
  })
  selectedOptionIds: string[];

  // Grading results, populated when the attempt closes.
  @Column({ name: 'is_correct', type: 'boolean', nullable: true })
  isCorrect: boolean | null;

  @Column({
    name: 'points_earned',
    type: 'smallint',
    nullable: true,
    default: 0,
  })
  pointsEarned: number | null;

  @Column({ name: 'saved_at', type: 'timestamptz', default: () => 'now()' })
  savedAt: Date;
}
