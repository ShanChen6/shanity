import { OrderStatus } from './entities/order.entity.js';

// Mirrors the orders_guard_update trigger. Keep both in sync.
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  [OrderStatus.PENDING]: [
    OrderStatus.PROCESSING,
    OrderStatus.COMPLETED,
    OrderStatus.EXPIRED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PROCESSING]: [
    OrderStatus.COMPLETED,
    OrderStatus.EXPIRED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.COMPLETED]: [OrderStatus.REFUNDED],
  // Money paid inside the order's window still fulfils it when the webhook
  // arrives late (see PaymentSettlementService).
  [OrderStatus.EXPIRED]: [OrderStatus.COMPLETED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
};

export const canTransitionOrder = (from: OrderStatus, to: OrderStatus) =>
  TRANSITIONS[from].includes(to);
