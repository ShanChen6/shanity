/**
 * Published after an order has been durably marked COMPLETED. Consumers
 * (enrollment, receipts, analytics...) react to this fact and must be
 * idempotent: it can be delivered again by the fulfilment reconciler.
 */
export class OrderCompletedEvent {
  constructor(
    readonly orderId: string,
    readonly orderCode: string,
    readonly userId: string,
    /** Courses bought, taken from the frozen order items. */
    readonly courseIds: readonly string[],
    readonly completedAt: Date,
  ) {}
}
