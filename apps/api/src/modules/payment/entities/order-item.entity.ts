import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Course } from '../../../courses/course.entity.js';
import { CourseCurrency } from '../../../courses/course-currency.js';
import { bigintNumberTransformer } from '../../../database/bigint-number.transformer.js';
import { Order } from './order.entity.js';

// Append-only data snapshot taken at checkout. `courseId` is a reference for
// navigation and enrollment only: it must never be used to look up a price or
// title. Rows cannot be updated or deleted (database trigger).
@Entity('order_items')
@Index('order_items_order_course_key', ['orderId', 'courseId'], {
  unique: true,
})
@Index('order_items_course_idx', ['courseId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'order_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, (order) => order.items, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'FK_order_items_order',
  })
  order: Relation<Order>;

  @Column({ name: 'course_id', type: 'uuid' }) courseId: string;
  @ManyToOne(() => Course, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'course_id',
    foreignKeyConstraintName: 'FK_order_items_course',
  })
  course: Relation<Course>;

  // 0-based position the buyer chose; rows of one INSERT share created_at.
  @Column({ type: 'smallint', default: 0 })
  position: number;

  @Column({ name: 'course_title_snapshot', type: 'varchar', length: 255 })
  courseTitleSnapshot: string;

  // List price at checkout, minor units.
  @Column({
    name: 'unit_price_snapshot',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  unitPriceSnapshot: number;

  @Column({
    name: 'discount_snapshot',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  discountSnapshot: number;

  // unitPriceSnapshot - discountSnapshot (CHECK constraint).
  @Column({
    name: 'final_price_snapshot',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  finalPriceSnapshot: number;

  @Column({ type: 'varchar', length: 10 }) currency: CourseCurrency;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
