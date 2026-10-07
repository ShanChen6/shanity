import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { bigintNumberTransformer } from '../../../database/bigint-number.transformer.js';

export enum PaymentTransactionStatus {
  INITIATED = 'INITIATED',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('payment_transactions')
@Index('payment_transactions_order_id_idx', ['orderId'])
@Index('payment_transactions_provider_id_key', ['providerTransactionId'], {
  unique: true,
  where: 'provider_transaction_id IS NOT NULL',
})
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'order_id', type: 'uuid' }) orderId: string;
  @Column({
    name: 'provider_transaction_id',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  providerTransactionId: string | null;
  @Column({ type: 'bigint', transformer: bigintNumberTransformer })
  amount: number;
  @Column({ name: 'transfer_content', type: 'text' }) transferContent: string;
  @Column({
    type: 'enum',
    enum: PaymentTransactionStatus,
    enumName: 'PaymentTransactionStatus',
  })
  status: PaymentTransactionStatus;
  @Column({ name: 'raw_payload', type: 'jsonb' }) rawPayload: Record<
    string,
    unknown
  >;
  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
