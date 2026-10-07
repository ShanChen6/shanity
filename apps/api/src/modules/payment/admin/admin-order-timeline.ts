import { OrderAuditAction } from '../entities/order-audit-log.entity.js';
import { OrderStatus } from '../entities/order.entity.js';
import { PaymentTransactionStatus } from '../entities/payment-transaction.entity.js';
import { MANUAL_RECONCILED } from '../interfaces/payment-provider.enum.js';
import type { AuditLogView } from '../order-audit.service.js';
import type { AdminLedgerEntry, TimelineEvent } from './admin-order.view.js';

export interface TimelineInput {
  order: {
    status: OrderStatus;
    createdAt: Date;
    completedAt: Date | null;
  };
  /** Ledger rows with the bookkeeping timestamps (`updatedAt`) kept. */
  ledger: Array<AdminLedgerEntry & { updatedAt: Date }>;
  auditLogs: AuditLogView[];
  enrollments: Array<{
    courseTitle: string;
    enrolledAt: Date;
    revokedAt: Date | null;
  }>;
}

const REFUND_STATUSES: readonly PaymentTransactionStatus[] = [
  PaymentTransactionStatus.REFUNDED,
  PaymentTransactionStatus.PARTIALLY_REFUNDED,
];

/**
 * A ledger row that checkout opened (INITIATED) and a notification later
 * completed in place keeps `createdAt` and gains a later `updatedAt`; a row
 * recorded straight from a notification has them equal.
 */
const wasInitiated = (row: {
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) =>
  row.status === PaymentTransactionStatus.INITIATED ||
  row.updatedAt.getTime() > row.createdAt.getTime();

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * The order's life as a chronological list: Order Created -> Payment
 * Initiated -> Webhook Received / Manual Reconciled -> Order Completed &
 * Enrollment Granted -> refunds and revocations. Derived from the ledger, the
 * audit trail and enrollments; nothing here is stored separately.
 */
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { type: 'ORDER_CREATED', at: input.order.createdAt },
  ];

  for (const row of input.ledger) {
    const common = {
      provider: row.provider,
      providerTransactionId: row.providerTransactionId,
      amount: row.amount,
    };
    if (REFUND_STATUSES.includes(row.status)) {
      events.push({
        type: 'REFUND_ISSUED',
        at: row.createdAt,
        ...common,
        payload: row.rawPayload,
      });
      continue;
    }
    if (row.provider === MANUAL_RECONCILED) {
      const reconciliation = record(row.rawPayload.reconciliation);
      const actor = record(reconciliation?.actor);
      events.push({
        type: 'MANUAL_RECONCILED',
        at: row.createdAt,
        ...common,
        payload: row.rawPayload,
        actorEmail: typeof actor?.email === 'string' ? actor.email : null,
        note:
          typeof reconciliation?.note === 'string' ? reconciliation.note : null,
      });
      continue;
    }
    if (wasInitiated(row))
      events.push({
        type: 'PAYMENT_INITIATED',
        at: row.createdAt,
        provider: row.provider,
        providerTransactionId: row.providerTransactionId,
      });
    if (row.status === PaymentTransactionStatus.SUCCESS)
      events.push({
        type: 'WEBHOOK_RECEIVED',
        at: row.receivedAt,
        ...common,
        payload: row.rawPayload,
      });
    else if (row.status === PaymentTransactionStatus.FAILED)
      events.push({
        type: 'PAYMENT_FAILED',
        at: row.receivedAt,
        ...common,
        payload: row.rawPayload,
      });
  }

  if (input.order.completedAt)
    events.push({ type: 'ORDER_COMPLETED', at: input.order.completedAt });
  for (const enrollment of input.enrollments) {
    events.push({
      type: 'ENROLLMENT_GRANTED',
      at: enrollment.enrolledAt,
      courseTitle: enrollment.courseTitle,
    });
    if (enrollment.revokedAt)
      events.push({
        type: 'ENROLLMENT_REVOKED',
        at: enrollment.revokedAt,
        courseTitle: enrollment.courseTitle,
      });
  }
  for (const log of input.auditLogs) {
    const status = log.newState?.status;
    if (
      log.action === OrderAuditAction.STATUS_CHANGED &&
      (status === OrderStatus.EXPIRED || status === OrderStatus.CANCELLED)
    )
      events.push({
        type:
          status === OrderStatus.EXPIRED ? 'ORDER_EXPIRED' : 'ORDER_CANCELLED',
        at: log.createdAt,
        note: log.reason,
      });
  }

  // Stable sort keeps the natural order of events that share a timestamp.
  return events
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) =>
        a.event.at.getTime() - b.event.at.getTime() || a.index - b.index,
    )
    .map(({ event }) => event);
}
