import type { CourseCurrency } from '../../../courses/course-currency.js';
import type { OrderStatus } from '../entities/order.entity.js';
import type { PaymentTransactionStatus } from '../entities/payment-transaction.entity.js';
import type { LedgerProvider } from '../interfaces/payment-provider.enum.js';
import type { AuditLogView } from '../order-audit.service.js';

/**
 * Wire shapes of the admin order API (also mirrored by the web client).
 * Money is an integer in the currency's minor unit; dates are ISO strings on
 * the wire. Student identity comes from `users`; everything about *what was
 * bought* comes from the frozen order snapshot, never from `courses`.
 */
export interface AdminOrderListItem {
  id: string;
  code: string;
  status: OrderStatus;
  student: { id: string; displayName: string; email: string };
  /** Course titles frozen at purchase, in cart order. */
  courses: Array<{ title: string; finalPrice: number }>;
  currency: CourseCurrency;
  subtotal: number;
  discountTotal: number;
  finalTotal: number;
  paidAmount: number;
  refundedAmount: number;
  /** The provider that moved the money, else the one checkout started with. */
  provider: LedgerProvider | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
}

export interface AdminOrderList {
  items: AdminOrderListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface AdminOrderItemSnapshot {
  id: string;
  courseId: string;
  title: string;
  unitPrice: number;
  discount: number;
  finalPrice: number;
  currency: CourseCurrency;
  /** Whether the student currently has access to this course. */
  enrollment: 'ACTIVE' | 'REVOKED' | 'NONE';
}

export interface AdminLedgerEntry {
  id: string;
  provider: LedgerProvider;
  providerTransactionId: string | null;
  status: PaymentTransactionStatus;
  amount: number;
  feeAmount: number;
  currency: CourseCurrency;
  transferContent: string | null;
  receivedAt: Date;
  createdAt: Date;
  rawPayload: Record<string, unknown>;
}

export type TimelineEventType =
  | 'ORDER_CREATED'
  | 'PAYMENT_INITIATED'
  | 'WEBHOOK_RECEIVED'
  | 'PAYMENT_FAILED'
  | 'MANUAL_RECONCILED'
  | 'ORDER_COMPLETED'
  | 'ENROLLMENT_GRANTED'
  | 'REFUND_ISSUED'
  | 'ENROLLMENT_REVOKED'
  | 'ORDER_EXPIRED'
  | 'ORDER_CANCELLED';

export interface TimelineEvent {
  type: TimelineEventType;
  at: Date;
  provider?: LedgerProvider | null;
  providerTransactionId?: string | null;
  amount?: number | null;
  /** Verbatim provider payload / reconciliation record, when there is one. */
  payload?: Record<string, unknown> | null;
  /** Back-office user behind a manual event. */
  actorEmail?: string | null;
  note?: string | null;
  courseTitle?: string | null;
}

export interface AdminOrderDetail {
  id: string;
  code: string;
  status: OrderStatus;
  student: { id: string; displayName: string; email: string };
  items: AdminOrderItemSnapshot[];
  summary: {
    currency: CourseCurrency;
    subtotal: number;
    discountTotal: number;
    finalTotal: number;
    paidAmount: number;
    refundedAmount: number;
    refundableAmount: number;
    refundStatus: 'NONE' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
  };
  provider: LedgerProvider | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date;
  transactions: AdminLedgerEntry[];
  timeline: TimelineEvent[];
  /** Newest first. */
  auditLogs: AuditLogView[];
  /** Which workflows the order currently allows (the server re-checks). */
  actions: { canReconcile: boolean; canRefund: boolean };
}
