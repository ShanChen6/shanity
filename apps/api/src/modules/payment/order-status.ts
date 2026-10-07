import { OrderStatus } from './entities/order.entity.js';

// Mirrors the orders_status_transition trigger. Keep both in sync.
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
  [OrderStatus.EXPIRED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
};

export const canTransitionOrder = (from: OrderStatus, to: OrderStatus) =>
  TRANSITIONS[from].includes(to);
