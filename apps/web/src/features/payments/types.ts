export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentProvider =
  | "VIETQR"
  | "STRIPE"
  | "MOMO"
  | "VNPAY"
  | "MANUAL_BANK";

export type OrderItem = {
  id: string;
  courseId: string;
  courseTitleSnapshot: string;
  unitPriceSnapshot: number;
  discountSnapshot: number;
  finalPriceSnapshot: number;
  currency: string;
  /** Navigation only; null if the course no longer exists. */
  courseSlug: string | null;
};

/** A student's order. Every amount and title is the checkout-time snapshot. */
export type StudentOrder = {
  orderId: string;
  code: string;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  finalTotal: number;
  paymentProvider: PaymentProvider | null;
  expiresAt: string;
  createdAt: string;
  items: OrderItem[];
  providerTransactionId: string | null;
  canResume: boolean;
};

export type StudentOrderPage = {
  data: StudentOrder[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/** Response of the lightweight polling endpoint. */
export type OrderStatusSnapshot = {
  status: OrderStatus;
  isPaid: boolean;
  expiresAt: string;
  serverTime: string;
};

export type BankTransferInstructions = {
  bankId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  amount: number;
  content: string;
};

export type CheckoutSession = {
  orderId: string;
  orderCode: string;
  provider: PaymentProvider;
  providerTransactionId: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
  transfer?: BankTransferInstructions;
  amount: number;
  currency: string;
  expiresAt: string;
};

export type PaymentMethod = {
  provider: PaymentProvider;
  /** An adapter exists (false: the gateway is not built yet). */
  registered: boolean;
  /** Registered and configured right now. */
  available: boolean;
  supportsCurrency: boolean;
};

export type OrderListFilter = "all" | "pending" | "completed" | "cancelled";
