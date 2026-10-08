import { Exclude } from 'class-transformer';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { QuestionType, type EssayConfig } from '../domain/assessment.types.js';
import { QuizEntity } from './quiz.entity.js';
import { QuizOptionEntity } from './quiz-option.entity.js';

// Backward-compatible export for the Sprint 7 name used throughout the module.
export { QuestionType as QuizQuestionType };

@Entity('quiz_questions')
@Index('IDX_quiz_questions_quiz_position', ['quizId', 'position'])
export class QuizQuestionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'quiz_id', type: 'uuid' })
  quizId: string;

  @ManyToOne(() => QuizEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'quiz_id',
    foreignKeyConstraintName: 'FK_quiz_questions_quizzes',
  })
  quiz: Relation<QuizEntity>;

  @Column({
    type: 'enum',
    enum: QuestionType,
    enumName: 'QuizQuestionType',
    default: QuestionType.SINGLE_CHOICE,
  })
  type: QuestionType;

  // Markdown/HTML prompt.
  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'smallint', default: 1 })
  position: number;

  @Column({ type: 'smallint', default: 10 })
  points: number;

  @Column({ name: 'essay_config', type: 'jsonb', nullable: true })
  essayConfig: EssayConfig | null;

  // Review data: hidden from serialization unless a DTO copies it explicitly.
  @Exclude({ toPlainOnly: true })
  @Column({ type: 'text', nullable: true })
  explanation: string | null;

  @OneToMany(() => QuizOptionEntity, (option) => option.question)
  options: Relation<QuizOptionEntity[]>;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  // PostgreSQL's trigger updates this for ORM and direct SQL writes.
  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
