import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { PaymentProviderEnum } from '../interfaces/payment-provider.enum.js';

export enum WebhookLogStatus {
  /** Received and authenticated; being (or not yet) processed. */
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
  FAILED = 'FAILED',
  /** Same provider transaction/event already processed: acknowledged, no-op. */
  DUPLICATE = 'DUPLICATE',
}

/**
 * Verbatim audit record of every *authenticated* webhook delivery. Requests
 * that fail signature verification are never stored. The partial unique
 * indexes make "processed once" a database guarantee.
 */
@Entity('webhook_logs')
@Index('idx_webhook_unique_event', ['provider', 'providerTransactionId'], {
  unique: true,
  where: `status = 'PROCESSED'`,
})
@Index('idx_webhook_unique_event_id', ['provider', 'eventId'], {
  unique: true,
  where: `status = 'PROCESSED' AND event_id IS NOT NULL`,
})
@Index('webhook_logs_pending_idx', ['createdAt'], {
  where: `status IN ('PENDING','FAILED')`,
})
@Index('webhook_logs_provider_txn_idx', ['provider', 'providerTransactionId'])
export class WebhookLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({
    type: 'enum',
    enum: PaymentProviderEnum,
    enumName: 'PaymentProvider',
  })
  provider: PaymentProviderEnum;

  @Column({ name: 'event_id', type: 'varchar', length: 150, nullable: true })
  eventId: string | null;

  @Column({
    name: 'provider_transaction_id',
    type: 'varchar',
    length: 150,
    nullable: true,
  })
  providerTransactionId: string | null;

  @Column({ type: 'jsonb' }) payload: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: WebhookLogStatus,
    enumName: 'WebhookLogStatus',
    default: WebhookLogStatus.PENDING,
  })
  status: WebhookLogStatus;

  // What the engine decided (COMPLETED, IGNORED, PARTIAL_AMOUNT, ...).
  @Column({ type: 'varchar', length: 40, nullable: true })
  outcome: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}
