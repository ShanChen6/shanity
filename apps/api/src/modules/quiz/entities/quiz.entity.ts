import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../../users/user.entity.js';

export enum QuizScope {
  LESSON = 'LESSON',
  CHAPTER = 'CHAPTER',
  COURSE = 'COURSE',
  STANDALONE = 'STANDALONE',
}

export enum QuizStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum ReviewPolicy {
  ALWAYS = 'ALWAYS',
  AFTER_PASS = 'AFTER_PASS',
  AFTER_EXHAUSTED = 'AFTER_EXHAUSTED',
  NEVER = 'NEVER',
}

export enum GradingPolicy {
  HIGHEST = 'HIGHEST',
  LATEST = 'LATEST',
}

@Entity('quizzes')
@Index('IDX_quizzes_scope_target', ['scope', 'targetId'])
@Index('UQ_quizzes_slug', ['slug'], {
  unique: true,
  where: 'slug IS NOT NULL',
})
export class QuizEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    type: 'enum',
    enum: QuizScope,
    enumName: 'QuizScope',
    default: QuizScope.LESSON,
  })
  scope: QuizScope;

  @Column({ name: 'target_id', type: 'uuid', nullable: true })
  targetId: string | null;

  @Column({
    type: 'enum',
    enum: QuizStatus,
    enumName: 'QuizStatus',
    default: QuizStatus.DRAFT,
  })
  status: QuizStatus;

  @Column({ name: 'passing_score', type: 'smallint', default: 80 })
  passingScore: number;

  @Column({ name: 'max_attempts', type: 'smallint', nullable: true })
  maxAttempts: number | null;

  @Column({ name: 'duration_minutes', type: 'integer', nullable: true })
  durationMinutes: number | null;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({
    name: 'review_policy',
    type: 'enum',
    enum: ReviewPolicy,
    enumName: 'ReviewPolicy',
    default: ReviewPolicy.ALWAYS,
  })
  reviewPolicy: ReviewPolicy;

  @Column({
    name: 'grading_policy',
    type: 'enum',
    enum: GradingPolicy,
    enumName: 'GradingPolicy',
    default: GradingPolicy.HIGHEST,
  })
  gradingPolicy: GradingPolicy;

  @Column({ name: 'shuffle_questions', type: 'boolean', default: true })
  shuffleQuestions: boolean;

  @Column({ name: 'shuffle_options', type: 'boolean', default: true })
  shuffleOptions: boolean;

  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'created_by',
    foreignKeyConstraintName: 'FK_quizzes_users',
  })
  creator: Relation<User>;

  // Set only by the publish endpoint.
  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
