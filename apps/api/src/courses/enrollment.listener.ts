import { Injectable, OnModuleInit } from '@nestjs/common';
import { OrderCompletedEvent } from '../modules/payment/events/order-completed.event.js';
import { PaymentEventBus } from '../modules/payment/events/payment-event-bus.js';
import { EnrollmentService } from './enrollment.service.js';

/**
 * Enrollment bounded context reacting to payment facts: once an order is
 * COMPLETED, every course on it is granted to the buyer. Knows nothing about
 * gateways. Safe to run more than once for the same order.
 */
@Injectable()
export class EnrollmentListener implements OnModuleInit {
  constructor(
    private readonly bus: PaymentEventBus,
    private readonly enrollments: EnrollmentService,
  ) {}

  onModuleInit() {
    this.bus.subscribe(OrderCompletedEvent, (event) => this.handle(event));
  }

  /** Grants every course; reports all failures so none hides another. */
  async handle(event: OrderCompletedEvent) {
    const results = await Promise.allSettled(
      event.courseIds.map((courseId) =>
        this.enrollments.grantEnrollment(event.userId, courseId),
      ),
    );
    const failed = results.filter((result) => result.status === 'rejected');
    if (failed.length > 0)
      throw new AggregateError(
        failed.map((result) => (result as PromiseRejectedResult).reason),
        `Enrollment failed for ${failed.length}/${event.courseIds.length} course(s) of order ${event.orderCode}`,
      );
  }
}
