import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
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
  type VerifyNotificationInput,
  type VerifyNotificationResult,
} from './interfaces/index.js';
import { fromMinorUnits } from './money.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';
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

/** A provider's authenticated statement about one payment attempt. */
export type SettlementFact = Omit<VerifyNotificationResult, 'isValid'>;

const currencies: readonly string[] = Object.values(CourseCurrency);

/**
 * Turns authenticated provider facts into order state. It only talks to the
 * `PaymentProvider` abstraction (through the factory), so it is unchanged when
 * a gateway is added or replaced.
 *
 * Strict path: nothing reaches `settle` unless `verifyNotification` returned
 * `isValid: true`. Settlement runs in one transaction under a pessimistic lock
 * on the order; the `OrderCompletedEvent` is published only after it commits.
 */
@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly factory: PaymentProviderFactory,
    private readonly database: DatabaseService,
    private readonly ledger: PaymentTransactionService,
    private readonly events: PaymentEventBus,
  ) {}

  async handleNotification(
    name: PaymentProviderEnum,
    input: VerifyNotificationInput,
  ): Promise<WebhookOutcome> {
    const provider = this.factory.getProvider(name);
    const { isValid, ...fact } = await provider.verifyNotification(input);
    if (!isValid) {
      this.logger.warn(`Rejected unauthenticated ${name} notification`);
      throw new UnauthorizedException('INVALID_WEBHOOK_SIGNATURE');
    }
    return this.settle(provider.providerName, fact);
  }

  /** Also used by the reconciler, which authenticates by querying the provider. */
  async settle(
    provider: PaymentProviderEnum,
    fact: SettlementFact,
  ): Promise<WebhookOutcome> {
    // Nothing to settle yet, or an event type we do not act on.
    if (fact.status === PaymentStatusEnum.PENDING)
      return { status: 'ACKNOWLEDGED' };
    // Money we cannot attribute to any order.
    if (!fact.orderCode) {
      this.logger.warn(
        `${provider} ${fact.providerTransactionId}: no order code, ignored`,
      );
      return { status: 'IGNORED' };
    }

    let amount: number;
    try {
      amount = fromMinorUnits(fact.amount);
    } catch {
      throw new BadRequestException('INVALID_NOTIFICATION_PAYLOAD');
    }

    const { outcome, completed } = await this.database.dataSource.transaction(
      async (manager) => {
        const order = await manager
          .getRepository(Order)
          .createQueryBuilder('orders')
          .setLock('pessimistic_write')
          .where('orders.code = :code', { code: fact.orderCode })
          .getOne();
        if (!order) return { outcome: { status: 'IGNORED' } as WebhookOutcome };

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
          });
        const done = (status: WebhookStatus, created: boolean) => ({
          outcome: {
            status: created ? status : 'ALREADY_PROCESSED',
          } as WebhookOutcome,
        });

        // A failed / cancelled / expired attempt is recorded; the order stays
        // PENDING so the buyer can try another gateway.
        if (fact.status !== PaymentStatusEnum.SUCCESS)
          return done(
            'PAYMENT_FAILED',
            (await book(PaymentTransactionStatus.FAILED)).created,
          );

        if (
          order.status === OrderStatus.PENDING &&
          order.expiresAt <= new Date()
        ) {
          order.status = OrderStatus.EXPIRED;
          await manager.save(order);
        }

        // Money arrived that cannot fulfil this order (wrong currency, or the
        // order is expired / cancelled / already paid / refunded): keep the
        // evidence for finance, grant nothing.
        if (
          !currencies.includes(fact.currency) ||
          fact.currency !== order.currency
        )
          return done(
            'CURRENCY_MISMATCH',
            (await book(PaymentTransactionStatus.FAILED)).created,
          );
        if (order.status !== OrderStatus.PENDING)
          return done(
            'IGNORED',
            (await book(PaymentTransactionStatus.FAILED)).created,
          );

        // Short payment: keep the evidence but leave the order PENDING. Freezing
        // it (PROCESSING) would let anyone who learns an order code lock the
        // buyer out with a token transfer; the buyer can still pay in full.
        if (amount < order.finalTotal)
          return done(
            'PARTIAL_AMOUNT',
            (await book(PaymentTransactionStatus.FAILED)).created,
          );

        const { created } = await book(PaymentTransactionStatus.SUCCESS);
        if (!created) return done('COMPLETED', false);
        order.status = OrderStatus.COMPLETED;
        await manager.save(order);
        // Access derives from the items frozen at checkout, never `courses`.
        const items = await manager.getRepository(OrderItem).find({
          where: { orderId: order.id },
          order: { position: 'ASC', id: 'ASC' },
        });
        return {
          outcome: { status: 'COMPLETED' } as WebhookOutcome,
          completed: new OrderCompletedEvent(
            order.id,
            order.code,
            order.userId,
            items.map((item) => item.courseId),
            new Date(),
          ),
        };
      },
    );

    // After COMMIT: listeners see durable state and a rolled-back settlement
    // can never grant access. Failures are logged and healed by the reconciler.
    if (completed) await this.events.publish(completed);
    return outcome;
  }
}
