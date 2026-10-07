import type { CourseCurrency } from '../../courses/course-currency.js';
import type { OrderItem } from './entities/order-item.entity.js';
import type { Order, OrderStatus } from './entities/order.entity.js';
import type {
  PaymentProvider,
  PaymentTransaction,
  PaymentTransactionStatus,
} from './entities/payment-transaction.entity.js';

export interface OrderItemView {
  id: string;
  courseId: string;
  courseTitleSnapshot: string;
  unitPriceSnapshot: number;
  discountSnapshot: number;
  finalPriceSnapshot: number;
  currency: CourseCurrency;
}

export interface PaymentView {
  id: string;
  provider: PaymentProvider;
  providerTransactionId: string | null;
  amount: number;
  feeAmount: number;
  currency: CourseCurrency;
  status: PaymentTransactionStatus;
  receivedAt: Date;
}

/** Everything an invoice or order-history screen needs; no live course data. */
export interface OrderView {
  orderId: string;
  code: string;
  status: OrderStatus;
  currency: CourseCurrency;
  subtotal: number;
  discountTotal: number;
  finalTotal: number;
  expiresAt: Date;
  createdAt: Date;
  items: OrderItemView[];
  payments?: PaymentView[];
}

export const toOrderView = (
  order: Order,
  items: readonly OrderItem[],
  payments?: readonly PaymentTransaction[],
): OrderView => ({
  orderId: order.id,
  code: order.code,
  status: order.status,
  currency: order.currency,
  subtotal: order.subtotal,
  discountTotal: order.discountTotal,
  finalTotal: order.finalTotal,
  expiresAt: order.expiresAt,
  createdAt: order.createdAt,
  items: items.map((item) => ({
    id: item.id,
    courseId: item.courseId,
    courseTitleSnapshot: item.courseTitleSnapshot,
    unitPriceSnapshot: item.unitPriceSnapshot,
    discountSnapshot: item.discountSnapshot,
    finalPriceSnapshot: item.finalPriceSnapshot,
    currency: item.currency,
  })),
  // rawPayload is deliberately never exposed through the API.
  ...(payments && {
    payments: payments.map((payment) => ({
      id: payment.id,
      provider: payment.provider,
      providerTransactionId: payment.providerTransactionId,
      amount: payment.amount,
      feeAmount: payment.feeAmount,
      currency: payment.currency,
      status: payment.status,
      receivedAt: payment.receivedAt,
    })),
  }),
});
