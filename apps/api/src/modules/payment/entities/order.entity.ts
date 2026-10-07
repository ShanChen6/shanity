import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { CourseCurrency } from '../../../courses/course-currency.js';
import { bigintNumberTransformer } from '../../../database/bigint-number.transformer.js';
import type { OrderItem } from './order-item.entity.js';

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PaymentMethod {
  VIETQR = 'VIETQR',
  MANUAL_BANK = 'MANUAL_BANK',
}

// The order header is a frozen financial record: code, owner, currency and the
// three totals never change after INSERT (enforced by a database trigger).
// Only status, payment_method, expires_at and updated_at are mutable.
@Entity('orders')
@Index('orders_code_key', ['code'], { unique: true })
@Index('orders_user_id_idx', ['userId'])
@Index('orders_pending_expiry_idx', ['status', 'expiresAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid') id: string;

  // Display code, e.g. SHAN-20261007-X89K.
  @Column({ type: 'varchar', length: 50 }) code: string;

  @Column({ name: 'user_id', type: 'uuid' }) userId: string;

  @Column({ type: 'enum', enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;

  @Column({ type: 'varchar', length: 10, default: CourseCurrency.VND })
  currency: CourseCurrency;

  // Minor units. Invariant (CHECK): finalTotal = subtotal - discountTotal, and
  // the totals equal the sums over order_items (deferred constraint trigger).
  @Column({ type: 'bigint', transformer: bigintNumberTransformer })
  subtotal: number;

  @Column({
    name: 'discount_total',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  discountTotal: number;

  @Column({
    name: 'final_total',
    type: 'bigint',
    transformer: bigintNumberTransformer,
  })
  finalTotal: number;

  // The payment method the buyer was shown; the provider that actually moved
  // money is recorded per payment_transactions row.
  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
  })
  paymentMethod: PaymentMethod;

  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt: Date;

  @OneToMany('OrderItem', 'order')
  items: Relation<OrderItem[]>;
}
