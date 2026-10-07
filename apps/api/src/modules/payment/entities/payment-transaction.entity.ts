import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { CourseCurrency } from '../../../courses/course-currency.js';
import { bigintNumberTransformer } from '../../../database/bigint-number.transformer.js';
import { PaymentProviderEnum } from '../interfaces/payment-provider.enum.js';
import { Order } from './order.entity.js';

export enum PaymentTransactionStatus {
  INITIATED = 'INITIATED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

// Money-movement ledger: one row per payment event. A refund is a new row
// (status REFUNDED / PARTIALLY_REFUNDED, amount = refunded amount), never a
// rewrite of the original SUCCESS row. Only INITIATED rows may be updated.
@Entity('payment_transactions')
@Index('payment_transactions_order_id_idx', ['orderId'])
@Index(
  'payment_transactions_provider_txn_key',
  ['provider', 'providerTransactionId'],
  { unique: true, where: 'provider_transaction_id IS NOT NULL' },
)
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'order_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'payment_transactions_order_id_fkey',
  })
  order: Relation<Order>;

  @Column({
    type: 'enum',
    enum: PaymentProviderEnum,
    enumName: 'PaymentProvider',
  })
  provider: PaymentProviderEnum;

  // Bank FT code, Stripe charge id, ... Unique per provider.
  @Column({
    name: 'provider_transaction_id',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  providerTransactionId: string | null;

  // Amount the provider actually recorded, minor units.
  @Column({ type: 'bigint', transformer: bigintNumberTransformer })
  amount: number;

  @Column({
    name: 'fee_amount',
    type: 'bigint',
    default: 0,
    transformer: bigintNumberTransformer,
  })
  feeAmount: number;

  @Column({ type: 'varchar', length: 10 }) currency: CourseCurrency;

  // Bank transfer memo (VietQR); null for card/wallet providers.
  @Column({ name: 'transfer_content', type: 'text', nullable: true })
  transferContent: string | null;

  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    enumName: 'PaymentTransactionStatus',
  })
  status: PaymentTransactionStatus;

  // Verbatim webhook / API response for audit and dispute reconciliation.
  @Column({ name: 'raw_payload', type: 'jsonb' }) rawPayload: Record<
    string,
    unknown
  >;

  @Column({ name: 'received_at', type: 'timestamptz', default: () => 'now()' })
  receivedAt: Date;
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  updatedAt: Date;
}
