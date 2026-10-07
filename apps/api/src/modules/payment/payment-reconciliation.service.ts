import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.module.js';
import { OrderCompletedEvent } from './events/order-completed.event.js';
import { PaymentEventBus } from './events/payment-event-bus.js';
import {
  PaymentStatusEnum,
  type PaymentProviderEnum,
} from './interfaces/index.js';
import { toMinorUnits } from './money.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';
import { PaymentWebhookService } from './payment-webhook.service.js';

const CHECKOUT_BATCH = 50;
const FULFILMENT_BATCH = 100;

interface StaleCheckoutRow {
  code: string;
  provider: PaymentProviderEnum;
  provider_transaction_id: string | null;
}

interface UnfulfilledRow {
  id: string;
  code: string;
  user_id: string;
  course_ids: string[];
}

/**
 * Safety nets for the two places a notification-driven design can lose work:
 * - a webhook that never arrived (pull the verdict with `queryPayment`);
 * - an order committed COMPLETED whose listener failed or never ran
 *   (re-publish the event; enrolment is idempotent).
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly factory: PaymentProviderFactory,
    private readonly webhooks: PaymentWebhookService,
    private readonly events: PaymentEventBus,
  ) {}

  /** Asks gateways about checkouts that stayed INITIATED. Returns settled count. */
  async reconcilePendingCheckouts(minAgeSeconds = 120): Promise<number> {
    const rows = await this.database.dataSource.query<StaleCheckoutRow[]>(
      `SELECT o.code, t.provider, t.provider_transaction_id
         FROM payment_transactions t JOIN orders o ON o.id = t.order_id
        WHERE t.status = 'INITIATED' AND o.status = 'PENDING'
          AND t.created_at <= now() - make_interval(secs => $2)
          AND t.created_at > now() - interval '24 hours'
        ORDER BY t.created_at LIMIT $1`,
      [CHECKOUT_BATCH, minAgeSeconds],
    );
    let settled = 0;
    for (const row of rows) {
      if (!this.factory.has(row.provider)) continue;
      const provider = this.factory.getProvider(row.provider);
      try {
        const result = await provider.queryPayment(
          row.code,
          row.provider_transaction_id ?? undefined,
        );
        if (result.status === PaymentStatusEnum.PENDING) continue;
        await this.webhooks.settle(provider.providerName, {
          orderCode: row.code,
          providerTransactionId: result.providerTransactionId,
          amount:
            result.status === PaymentStatusEnum.SUCCESS
              ? result.amountPaid
              : toMinorUnits(1),
          currency: result.currency,
          status: result.status,
          rawPayload: {
            source: 'reconciliation',
            result: serialisable(result),
          },
        });
        settled++;
      } catch (error) {
        this.logger.warn(
          `Reconciling ${row.provider} order ${row.code} failed: ${String(error)}`,
        );
      }
    }
    return settled;
  }

  /** Re-publishes OrderCompletedEvent for paid orders missing an enrolment. */
  async republishUnfulfilledOrders(minAgeSeconds = 60): Promise<number> {
    const rows = await this.database.dataSource.query<UnfulfilledRow[]>(
      `SELECT o.id, o.code, o.user_id,
              array_agg(i.course_id ORDER BY i.position, i.id) AS course_ids
         FROM orders o JOIN order_items i ON i.order_id = o.id
        WHERE o.status = 'COMPLETED'
          AND o.updated_at > now() - interval '30 days'
          AND o.updated_at <= now() - make_interval(secs => $2)
          AND EXISTS (
            SELECT 1 FROM order_items m
             WHERE m.order_id = o.id AND NOT EXISTS (
               SELECT 1 FROM enrollments e
                WHERE e.user_id = o.user_id AND e.course_id = m.course_id))
        GROUP BY o.id, o.code, o.user_id
        ORDER BY o.updated_at LIMIT $1`,
      [FULFILMENT_BATCH, minAgeSeconds],
    );
    for (const row of rows)
      await this.events.publish(
        new OrderCompletedEvent(
          row.id,
          row.code,
          row.user_id,
          row.course_ids,
          new Date(),
        ),
      );
    if (rows.length > 0)
      this.logger.warn(`Re-published fulfilment for ${rows.length} order(s)`);
    return rows.length;
  }
}

/** bigint is not JSON; the ledger stores this object. */
const serialisable = (result: object) =>
  JSON.parse(
    JSON.stringify(result, (_key, value: unknown) =>
      typeof value === 'bigint' ? value.toString() : value,
    ),
  ) as Record<string, unknown>;
