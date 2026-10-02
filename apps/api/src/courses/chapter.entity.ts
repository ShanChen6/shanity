import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Course } from './course.entity.js';

@Entity('chapters')
@Index('chapters_course_id_idx', ['courseId'])
@Index('chapters_course_position_idx', ['courseId', 'position'])
export class Chapter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'course_id', type: 'uuid' })
  courseId: string;

  @ManyToOne(() => Course, (course) => course.chapters, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_chapters_course',
  })
  course: Relation<Course>;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'integer' })
  position: number;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}