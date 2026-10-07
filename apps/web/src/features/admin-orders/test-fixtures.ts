import type { AdminOrderDetail, AdminOrderListItem } from "./types";

export const ORDER_ID = "11111111-1111-4111-8111-111111111111";
export const ORDER_CODE = "SHAN-20261007-AB12";

export const listItem = (
  overrides: Partial<AdminOrderListItem> = {},
): AdminOrderListItem => ({
  id: ORDER_ID,
  code: ORDER_CODE,
  status: "PENDING",
  student: {
    id: "22222222-2222-4222-8222-222222222222",
    displayName: "Nguyễn Văn An",
    email: "an.nguyen@example.test",
  },
  courses: [{ title: "React Nâng cao", finalPrice: 499000 }],
  currency: "VND",
  subtotal: 499000,
  discountTotal: 0,
  finalTotal: 499000,
  paidAmount: 0,
  refundedAmount: 0,
  provider: "VIETQR",
  createdAt: "2026-10-07T03:00:00.000Z",
  completedAt: null,
  expiresAt: "2026-10-07T03:30:00.000Z",
  ...overrides,
});

/** A PENDING order a staff member could reconcile. */
export const detail = (
  overrides: Partial<AdminOrderDetail> = {},
): AdminOrderDetail => ({
  id: ORDER_ID,
  code: ORDER_CODE,
  status: "PENDING",
  student: listItem().student,
  items: [
    {
      id: "item-1",
      courseId: "course-1",
      title: "React Nâng cao",
      unitPrice: 599000,
      discount: 100000,
      finalPrice: 499000,
      currency: "VND",
      enrollment: "NONE",
    },
  ],
  summary: {
    currency: "VND",
    subtotal: 599000,
    discountTotal: 100000,
    finalTotal: 499000,
    paidAmount: 0,
    refundedAmount: 0,
    refundableAmount: 0,
    refundStatus: "NONE",
  },
  provider: "VIETQR",
  createdAt: "2026-10-07T03:00:00.000Z",
  completedAt: null,
  expiresAt: "2026-10-07T03:30:00.000Z",
  transactions: [
    {
      id: "txn-1",
      provider: "VIETQR",
      providerTransactionId: "VQR-0001",
      status: "INITIATED",
      amount: 499000,
      feeAmount: 0,
      currency: "VND",
      transferContent: "SHAN20261007AB12",
      receivedAt: "2026-10-07T03:01:00.000Z",
      createdAt: "2026-10-07T03:01:00.000Z",
      rawPayload: { note: "<script>alert(1)</script>", amount: 499000 },
    },
  ],
  timeline: [
    { type: "ORDER_CREATED", at: "2026-10-07T03:00:00.000Z" },
    {
      type: "PAYMENT_INITIATED",
      at: "2026-10-07T03:01:00.000Z",
      provider: "VIETQR",
      providerTransactionId: "VQR-0001",
    },
    {
      type: "MANUAL_RECONCILED",
      at: "2026-10-07T04:00:00.000Z",
      provider: "MANUAL_RECONCILED",
      providerTransactionId: "FT26280123",
      amount: 499000,
      actorEmail: "finance@example.test",
      note: "Khách chuyển khoản đúng nội dung nhưng webhook bị mất",
      payload: {
        reconciliation: {
          proofImageUrl: `/api/v1/admin/orders/${ORDER_ID}/proofs/aaaa.png`,
        },
      },
    },
  ],
  auditLogs: [
    {
      id: "audit-2",
      action: "DETAIL_VIEWED",
      actorId: "33333333-3333-4333-8333-333333333333",
      actorType: "ADMIN",
      actorEmail: "admin@example.test",
      reason: "Admin opened the order",
      previousState: null,
      newState: { target: "order" },
      ipAddress: "203.0.113.7",
      userAgent: "Mozilla/5.0",
      createdAt: "2026-10-07T05:00:00.000Z",
    },
    {
      id: "audit-1",
      action: "STATUS_CHANGED",
      actorId: "SYSTEM",
      actorType: "SYSTEM",
      actorEmail: "system",
      reason: "Order expired without payment",
      previousState: { status: "PENDING" },
      newState: { status: "EXPIRED" },
      ipAddress: null,
      userAgent: null,
      createdAt: "2026-10-07T03:30:00.000Z",
    },
  ],
  actions: { canReconcile: true, canRefund: false },
  ...overrides,
});

/** A COMPLETED order with 499.000 ₫ paid and refundable. */
export const completedDetail = (
  overrides: Partial<AdminOrderDetail> = {},
): AdminOrderDetail =>
  detail({
    status: "COMPLETED",
    completedAt: "2026-10-07T04:00:00.000Z",
    summary: {
      currency: "VND",
      subtotal: 599000,
      discountTotal: 100000,
      finalTotal: 499000,
      paidAmount: 499000,
      refundedAmount: 0,
      refundableAmount: 499000,
      refundStatus: "NONE",
    },
    actions: { canReconcile: false, canRefund: true },
    ...overrides,
  });
