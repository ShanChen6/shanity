// Mirrors apps/api/src/modules/payment/admin/admin-order.view.ts. Dates are ISO
// strings; money is an integer in the currency's minor unit (dong / cents).
import type { OrderStatus } from "@/features/payments/types";

export type { OrderStatus };
export type OrderCurrency = "VND" | "USD";

/** Gateways a student can pay through (the only ones a reconciliation names). */
export type PaymentChannel =
  | "VIETQR"
  | "STRIPE"
  | "MOMO"
  | "VNPAY"
  | "MANUAL_BANK";
/** Every provider the payment ledger can hold. */
export type LedgerProvider = PaymentChannel | "MANUAL_RECONCILED";

export type LedgerStatus =
  | "INITIATED"
  | "SUCCESS"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";
export type RefundStatus = "NONE" | "PARTIALLY_REFUNDED" | "REFUNDED";
export type EnrollmentState = "ACTIVE" | "REVOKED" | "NONE";

export type Student = { id: string; displayName: string; email: string };

export type AdminOrderListItem = {
  id: string;
  code: string;
  status: OrderStatus;
  student: Student;
  courses: Array<{ title: string; finalPrice: number }>;
  currency: OrderCurrency;
  subtotal: number;
  discountTotal: number;
  finalTotal: number;
  paidAmount: number;
  refundedAmount: number;
  provider: LedgerProvider | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
};

export type AdminOrderList = {
  items: AdminOrderListItem[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type AdminOrderItem = {
  id: string;
  courseId: string;
  title: string;
  unitPrice: number;
  discount: number;
  finalPrice: number;
  currency: OrderCurrency;
  enrollment: EnrollmentState;
};

export type LedgerEntry = {
  id: string;
  provider: LedgerProvider;
  providerTransactionId: string | null;
  status: LedgerStatus;
  amount: number;
  feeAmount: number;
  currency: OrderCurrency;
  transferContent: string | null;
  receivedAt: string;
  createdAt: string;
  rawPayload: Record<string, unknown>;
};

export type TimelineEventType =
  | "ORDER_CREATED"
  | "PAYMENT_INITIATED"
  | "WEBHOOK_RECEIVED"
  | "PAYMENT_FAILED"
  | "MANUAL_RECONCILED"
  | "ORDER_COMPLETED"
  | "ENROLLMENT_GRANTED"
  | "REFUND_ISSUED"
  | "ENROLLMENT_REVOKED"
  | "ORDER_EXPIRED"
  | "ORDER_CANCELLED";

export type TimelineEvent = {
  type: TimelineEventType;
  at: string;
  provider?: LedgerProvider | null;
  providerTransactionId?: string | null;
  amount?: number | null;
  payload?: Record<string, unknown> | null;
  actorEmail?: string | null;
  note?: string | null;
  courseTitle?: string | null;
};

export type AuditAction =
  | "CREATED"
  | "STATUS_CHANGED"
  | "MANUAL_RECONCILED"
  | "REFUND_ISSUED"
  | "ENROLLMENT_REVOKED"
  | "NOTE_ADDED"
  | "DETAIL_VIEWED"
  | "PROOF_UPLOADED";
export type AuditActorType = "ADMIN" | "STUDENT" | "SYSTEM";

export type AuditLog = {
  id: string;
  action: AuditAction;
  /** User id, or "SYSTEM". */
  actorId: string;
  actorType: AuditActorType;
  actorEmail: string;
  reason: string;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type OrderSummary = {
  currency: OrderCurrency;
  subtotal: number;
  discountTotal: number;
  finalTotal: number;
  paidAmount: number;
  refundedAmount: number;
  refundableAmount: number;
  refundStatus: RefundStatus;
};

export type AdminOrderDetail = {
  id: string;
  code: string;
  status: OrderStatus;
  student: Student;
  items: AdminOrderItem[];
  summary: OrderSummary;
  provider: LedgerProvider | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string;
  transactions: LedgerEntry[];
  timeline: TimelineEvent[];
  /** Newest first. */
  auditLogs: AuditLog[];
  actions: { canReconcile: boolean; canRefund: boolean };
};

export type ReconcileRequest = {
  providerTransactionId: string;
  amountReceived: number;
  provider: PaymentChannel;
  note: string;
  proofImageUrl?: string;
};
export type ReconcileResult = {
  order: AdminOrderDetail;
  enrollmentGranted: boolean;
};

export type RefundRequest = {
  refundAmount: number;
  reason: string;
  notifyStudent: boolean;
};
export type RefundResult = {
  order: AdminOrderDetail;
  refund: {
    amount: number;
    status: "PARTIALLY_REFUNDED" | "REFUNDED";
    mode: "PROVIDER_API" | "INTERNAL";
    providerTransactionId: string;
    enrollmentsRevoked: number;
  };
};

export type ProofUpload = {
  proofKey: string;
  /** Path on the API origin; opening it is audited server-side. */
  proofImageUrl: string;
  contentType: string;
  size: number;
};
