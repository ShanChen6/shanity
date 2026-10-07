import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Order } from './order.entity.js';

export enum OrderAuditAction {
  CREATED = 'CREATED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  MANUAL_RECONCILED = 'MANUAL_RECONCILED',
  REFUND_ISSUED = 'REFUND_ISSUED',
  ENROLLMENT_REVOKED = 'ENROLLMENT_REVOKED',
  NOTE_ADDED = 'NOTE_ADDED',
  /** An admin opened the order (or one of its proof files). */
  DETAIL_VIEWED = 'DETAIL_VIEWED',
  PROOF_UPLOADED = 'PROOF_UPLOADED',
}

export enum OrderAuditActorType {
  /** Back-office staff: admin or finance officer. */
  ADMIN = 'ADMIN',
  STUDENT = 'STUDENT',
  SYSTEM = 'SYSTEM',
}

/**
 * Append-only audit trail of everything that happens to an order. The table
 * rejects UPDATE, DELETE and TRUNCATE (database triggers), so this entity is
 * only ever inserted and read. Never store secrets or card data in the state
 * snapshots.
 */
@Entity('order_audit_logs')
@Index('order_audit_logs_order_idx', ['orderId', 'createdAt', 'id'])
export class OrderAuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ name: 'order_id', type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'order_id',
    foreignKeyConstraintName: 'order_audit_logs_order_id_fkey',
  })
  order: Relation<Order>;

  @Column({
    name: 'actor_type',
    type: 'enum',
    enum: OrderAuditActorType,
    enumName: 'OrderAuditActorType',
  })
  actorType: OrderAuditActorType;

  // null <=> actorType SYSTEM. Deliberately not a foreign key.
  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'actor_email', type: 'varchar', length: 255 })
  actorEmail: string;

  @Column({
    type: 'enum',
    enum: OrderAuditAction,
    enumName: 'OrderAuditAction',
  })
  action: OrderAuditAction;

  @Column({ name: 'previous_state', type: 'jsonb', nullable: true })
  previousState: Record<string, unknown> | null;

  @Column({ name: 'new_state', type: 'jsonb', nullable: true })
  newState: Record<string, unknown> | null;

  // Mandatory for every action (CHECK: not blank).
  @Column({ type: 'text' }) reason: string;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  // Groups the rows (and ledger rows) written by one database transaction.
  @Column({ name: 'db_transaction_id', type: 'bigint', select: false })
  dbTransactionId: string;

  @Column({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'clock_timestamp()',
  })
  createdAt: Date;
}
