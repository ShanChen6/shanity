import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CourseCurrency } from '../../courses/course-currency.js';
import { DatabaseService } from '../../database/database.module.js';
import { OrderCompletedEvent } from './events/order-completed.event.js';
import { PaymentEventBus } from './events/payment-event-bus.js';
import { OrderItem } from './entities/order-item.entity.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import { PaymentTransactionStatus } from './entities/payment-transaction.entity.js';
import {
  PaymentStatusEnum,
  type PaymentProviderEnum,
  type VerifyNotificationResult,
} from './interfaces/index.js';
import { fromMinorUnits } from './money.js';
import { PaymentTransactionService } from './payment-transaction.service.js';

export type WebhookStatus =
  | 'COMPLETED'
  | 'ALREADY_PROCESSED'
  | 'IGNORED'
  | 'PARTIAL_AMOUNT'
  | 'PAYMENT_FAILED'
  | 'CURRENCY_MISMATCH'
  | 'ACKNOWLEDGED';

export interface WebhookOutcome {
  status: WebhookStatus;
}

export interface SettlementResult extends WebhookOutcome {
  /** A payment-ledger row exists for this provider transaction. */
  recorded: boolean;
}

/** A provider's authenticated statement about one payment attempt. */
export type SettlementFact = Omit<VerifyNotificationResult, 'isValid'>;

const currencies: readonly string[] = Object.values(CourseCurrency);

// A payment made inside the order's window is honoured even if the order has
// been swept to EXPIRED by the time the (late) notification arrives.
const CLOCK_SKEW_MS = 60_000;
// Providers that do not say when the payer paid (plain bank forwarders) get a
// bounded reinstatement window after expiry instead.
const REINSTATEMENT_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Whether money reported now may still fulfil `order`. Never depends on the
 * buyer's browser: only on order state and when the payment was made.
 */
export function canFulfil(
  order: Pick<Order, 'status' | 'expiresAt'>,
  paidAt: Date | undefined,
  now: Date,
) {
  if (
    order.status !== OrderStatus.PENDING &&
    order.status !== OrderStatus.EXPIRED
  )
    return false;
  if (order.status === OrderStatus.PENDING && order.expiresAt > now)
    return true;
  return paidAt
    ? paidAt.getTime() <= order.expiresAt.getTime() + CLOCK_SKEW_MS
    : now.getTime() <= order.expiresAt.getTime() + REINSTATEMENT_WINDOW_MS;
}

/**
 * Steps 4-6 of the webhook pipeline: idempotency + lock check, order state
 * transition, and fulfilment event. Knows only the provider-neutral
 * `SettlementFact`; gateways never reach this class.
 *
 * One manual transaction (QueryRunner) holds a pessimistic write lock on the
 * order. Concurrent deliveries queue on that lock; the first one writes the
 * ledger row and completes the order, every later one finds the settled ledger
 * row and exits without touching anything (early exit). The
 * `OrderCompletedEvent` is published only after COMMIT.
 */
@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly ledger: PaymentTransactionService,
    private readonly events: PaymentEventBus,
  ) {}

  async settle(
    provider: PaymentProviderEnum,
    fact: SettlementFact,
  ): Promise<SettlementResult> {
    // Nothing to settle yet, or an event type we do not act on.
    if (fact.status === PaymentStatusEnum.PENDING)
      return { status: 'ACKNOWLEDGED', recorded: false };
    // Money we cannot attribute to any order.
    if (!fact.orderCode) {
      this.logger.warn(
        `${provider} ${fact.providerTransactionId}: no order code, ignored`,
      );
      return { status: 'IGNORED', recorded: false };
    }
    let amount: number;
    try {
      amount = fromMinorUnits(fact.amount);
    } catch {
      throw new BadRequestException('INVALID_NOTIFICATION_PAYLOAD');
    }

    const queryRunner = this.database.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let result: SettlementResult;
    let completed: OrderCompletedEvent | undefined;
    try {
      const { manager } = queryRunner;
      // Step 4a: lock the order. Everything below is serialised per order.
      const order = await manager.findOne(Order, {
        where: { code: fact.orderCode },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) {
        await queryRunner.rollbackTransaction();
        return { status: 'IGNORED', recorded: false };
      }

      // Step 4b: early exit. This provider transaction was already settled by
      // an earlier (or concurrent, now finished) delivery: change nothing.
      const prior = fact.providerTransactionId
        ? await this.ledger.findByProviderTransaction(
            manager,
            provider,
            fact.providerTransactionId,
          )
        : null;
      if (
        prior &&
        prior.orderId === order.id &&
        prior.status !== PaymentTransactionStatus.INITIATED
      ) {
        await queryRunner.rollbackTransaction();
        return { status: 'ALREADY_PROCESSED', recorded: true };
      }

      const book = (status: PaymentTransactionStatus) =>
        this.ledger.settle(manager, {
          orderId: order.id,
          provider,
          providerTransactionId: fact.providerTransactionId || null,
          amount,
          currency: fact.currency as CourseCurrency,
          status,
          transferContent: fact.memo ?? null,
          rawPayload: fact.rawPayload,
          receivedAt: fact.paidAt,
        });
      const done = (status: WebhookStatus, created: boolean) => ({
        status: created ? status : ('ALREADY_PROCESSED' as const),
        recorded: true,
      });

      if (fact.status !== PaymentStatusEnum.SUCCESS) {
        // Failed / cancelled / expired attempt: recorded; the order stays as it
        // is so the buyer can try another gateway.
        result = done(
          'PAYMENT_FAILED',
          (await book(PaymentTransactionStatus.FAILED)).created,
        );
      } else if (
        !currencies.includes(fact.currency) ||
        fact.currency !== order.currency
      ) {
        result = done(
          'CURRENCY_MISMATCH',
          (await book(PaymentTransactionStatus.FAILED)).created,
        );
      } else if (!canFulfil(order, fact.paidAt, new Date())) {
        // Cancelled, refunded, already paid, or paid after the window: keep the
        // evidence for finance, grant nothing.
        if (order.status === OrderStatus.PENDING) {
          order.status = OrderStatus.EXPIRED;
          await manager.save(order);
        }
        result = done(
          'IGNORED',
          (await book(PaymentTransactionStatus.FAILED)).created,
        );
      } else if (amount < order.finalTotal) {
        // Short payment: evidence only. Freezing the order would let anyone who
        // learns an order code lock the buyer out with a token transfer.
        result = done(
          'PARTIAL_AMOUNT',
          (await book(PaymentTransactionStatus.FAILED)).created,
        );
      } else {
        // Step 5: state transition PENDING|EXPIRED -> COMPLETED.
        const { created } = await book(PaymentTransactionStatus.SUCCESS);
        result = done('COMPLETED', created);
        if (created) {
          order.status = OrderStatus.COMPLETED;
          await manager.save(order);
          // Access derives from the items frozen at checkout, never `courses`.
          const items = await manager.find(OrderItem, {
            where: { orderId: order.id },
            order: { position: 'ASC', id: 'ASC' },
          });
          completed = new OrderCompletedEvent(
            order.id,
            order.code,
            order.userId,
            items.map((item) => item.courseId),
            new Date(),
          );
        }
      }
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Step 6: after COMMIT, so listeners see durable state and a rolled-back
    // settlement can never grant access. Failures are logged and healed by the
    // reconciler; they never fail the acknowledgement.
    if (completed) await this.events.publish(completed);
    return result;
  }
}
