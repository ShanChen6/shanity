import { Exclude } from 'class-transformer';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { QuizQuestionEntity } from './quiz-question.entity.js';

@Entity('quiz_options')
@Index('IDX_quiz_options_question_position', ['questionId', 'position'])
export class QuizOptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'question_id', type: 'uuid' })
  questionId: string;

  @ManyToOne(() => QuizQuestionEntity, (question) => question.options, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'question_id',
    foreignKeyConstraintName: 'FK_quiz_options_questions',
  })
  question: Relation<QuizQuestionEntity>;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'smallint', default: 1 })
  position: number;

  // The answer key. Excluded from serialization by default; only the
  // instructor DTO copies it explicitly.
  @Exclude({ toPlainOnly: true })
  @Column({ name: 'is_correct', type: 'boolean', default: false })
  isCorrect: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
