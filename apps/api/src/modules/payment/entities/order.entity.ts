import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintNumberTransformer } from '../../../database/bigint-number.transformer.js';
import { CourseCurrency } from '../../../courses/course-currency.js';

export enum OrderStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  VIETQR = 'VIETQR',
  MANUAL_BANK = 'MANUAL_BANK',
}

@Entity('orders')
@Index('orders_code_key', ['code'], { unique: true })
@Index('orders_user_id_idx', ['userId'])
@Index('orders_pending_expiry_idx', ['status', 'expiresAt'])
export class Order {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', length: 32 }) code: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ name: 'course_id', type: 'uuid' }) courseId: string;
  // Total payable, frozen at creation from the order items' price snapshots.
  @Column({ type: 'bigint', transformer: bigintNumberTransformer })
  amount: number;
  @Column({ type: 'varchar', length: 3, default: CourseCurrency.VND })
  currency: CourseCurrency;
  @Column({ type: 'enum', enum: OrderStatus, enumName: 'OrderStatus' })
  status: OrderStatus;
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
}
