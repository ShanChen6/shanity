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
import { QuizEntity } from './quiz.entity.js';
import { QuizOptionEntity } from './quiz-option.entity.js';

export enum QuizQuestionType {
  SINGLE_CHOICE = 'SINGLE_CHOICE',
  MULTIPLE_CHOICE = 'MULTIPLE_CHOICE',
}

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
    enum: QuizQuestionType,
    enumName: 'QuizQuestionType',
    default: QuizQuestionType.SINGLE_CHOICE,
  })
  type: QuizQuestionType;

  // Markdown/HTML prompt.
  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'smallint', default: 1 })
  position: number;

  @Column({ type: 'smallint', default: 10 })
  points: number;

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
