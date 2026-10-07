import { Injectable, Logger } from '@nestjs/common';

type EventType<T> = abstract new (...args: never[]) => T;
type Handler<T> = (event: T) => void | Promise<void>;

/**
 * Minimal in-process, typed event bus for payment domain events.
 *
 * Unlike a fire-and-forget emitter, `publish` waits for every handler so the
 * caller (an HTTP request that just took the customer's money) returns only
 * after fulfilment ran. A failing handler never throws into the publisher —
 * the order is already committed — but it is logged and returned, and the
 * fulfilment reconciler re-publishes until the handler succeeds.
 */
@Injectable()
export class PaymentEventBus {
  private readonly logger = new Logger(PaymentEventBus.name);
  private readonly handlers = new Map<EventType<unknown>, Handler<any>[]>();

  subscribe<T>(type: EventType<T>, handler: Handler<T>) {
    const list = this.handlers.get(type) ?? [];
    list.push(handler);
    this.handlers.set(type, list);
    return () => {
      const current = this.handlers.get(type) ?? [];
      this.handlers.set(
        type,
        current.filter((existing) => existing !== handler),
      );
    };
  }

  /** Resolves with the handler failures (empty when everything succeeded). */
  async publish<T extends object>(event: T): Promise<unknown[]> {
    const handlers = this.handlers.get(event.constructor as EventType<T>) ?? [];
    const settled = await Promise.allSettled(
      handlers.map((handler) => Promise.resolve().then(() => handler(event))),
    );
    const failures = settled
      .filter(
        (result): result is PromiseRejectedResult =>
          result.status === 'rejected',
      )
      .map((result) => result.reason as unknown);
    for (const failure of failures)
      this.logger.error(
        `Handler for ${event.constructor.name} failed`,
        failure instanceof Error ? failure.stack : String(failure),
      );
    return failures;
  }
}
