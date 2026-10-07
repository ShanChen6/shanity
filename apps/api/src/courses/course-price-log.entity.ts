import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { bigintNumberTransformer } from '../database/bigint-number.transformer.js';
import { User } from '../users/user.entity.js';
import { CourseAccessType } from './course-access-type.js';
import { CourseCurrency } from './course-currency.js';
import { Course } from './course.entity.js';

// Append-only audit trail of pricing changes (revenue reports, reconciliation).
@Entity('course_price_logs')
@Index('course_price_logs_course_created_idx', ['courseId', 'createdAt'])
export class CoursePriceLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'course_id', type: 'uuid' }) courseId: string;
  @ManyToOne(() => Course, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_course_price_logs_course',
  })
  course: Relation<Course>;

  @Column({
    name: 'old_price',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  oldPrice: number;
  @Column({
    name: 'new_price',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  newPrice: number;

  @Column({ name: 'old_currency', type: 'varchar', length: 3 })
  oldCurrency: CourseCurrency;
  @Column({ name: 'new_currency', type: 'varchar', length: 3 })
  newCurrency: CourseCurrency;

  @Column({
    name: 'old_access_type',
    type: 'enum',
    enum: CourseAccessType,
    enumName: 'CourseAccessType',
  })
  oldAccessType: CourseAccessType;
  @Column({
    name: 'new_access_type',
    type: 'enum',
    enum: CourseAccessType,
    enumName: 'CourseAccessType',
  })
  newAccessType: CourseAccessType;

  // PENDING orders cancelled by this change (PAID -> FREE only).
  @Column({ name: 'cancelled_pending_orders', type: 'integer', default: 0 })
  cancelledPendingOrders: number;

  @Column({ name: 'changed_by_user_id', type: 'uuid' }) changedByUserId: string;
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'changed_by_user_id',
    foreignKeyConstraintName: 'FK_course_price_logs_user',
  })
  changedBy: Relation<User>;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
