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

// The price lives here, independent of courses.price, so later repricing never
// rewrites what a buyer agreed to pay.
@Entity('order_items')
@Index('order_items_order_course_key', ['orderId', 'courseId'], {
  unique: true,
})
@Index('order_items_course_idx', ['courseId'])
export class OrderItem {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'order_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
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

  @Column({
    name: 'unit_price_snapshot',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  unitPriceSnapshot: number;

  @Column({ type: 'varchar', length: 3 }) currency: CourseCurrency;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
