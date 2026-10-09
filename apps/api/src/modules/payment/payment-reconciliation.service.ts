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
import { PaymentSettlementService } from './payment-settlement.service.js';

const CHECKOUT_BATCH = 50;
/** Gateway look-ups per run at most, however many checkouts are open. */
export const CHECKOUT_MAX_PER_RUN = 500;
const FULFILMENT_BATCH = 100;

interface StaleCheckoutRow {
  id: string;
  /** created_at as PostgreSQL text: full precision for the keyset. */
  created_at: string;
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
    private readonly settlement: PaymentSettlementService,
    private readonly events: PaymentEventBus,
  ) {}

  /**
   * Asks gateways about checkouts that stayed INITIATED. Returns settled count.
   *
   * Walks every stale checkout page by page (keyset on created_at, id), not
   * only the oldest page: sessions that are simply still open stay INITIATED
   * for up to a day, and would otherwise fill the first page on every run
   * and starve a newer paid session whose webhook was lost.
   */
  async reconcilePendingCheckouts(minAgeSeconds = 120): Promise<number> {
    let settled = 0;
    let seen = 0;
    let after: StaleCheckoutRow | null = null;
    while (seen < CHECKOUT_MAX_PER_RUN) {
      const limit = Math.min(CHECKOUT_BATCH, CHECKOUT_MAX_PER_RUN - seen);
      const rows: StaleCheckoutRow[] = await this.database.dataSource.query(
        `SELECT t.id, t.created_at::text AS created_at,
                o.code, t.provider, t.provider_transaction_id
           FROM payment_transactions t JOIN orders o ON o.id = t.order_id
          WHERE t.status = 'INITIATED' AND o.status = 'PENDING'
            AND t.created_at <= now() - make_interval(secs => $2)
            AND t.created_at > now() - interval '24 hours'
            AND ($3::timestamptz IS NULL
              OR (t.created_at, t.id) > ($3::timestamptz, $4::uuid))
          ORDER BY t.created_at, t.id LIMIT $1`,
        [limit, minAgeSeconds, after?.created_at ?? null, after?.id ?? null],
      );
      for (const row of rows) if (await this.reconcileCheckout(row)) settled++;
      seen += rows.length;
      if (rows.length < limit) break;
      after = rows[rows.length - 1]!;
    }
    return settled;
  }

  /** One stale checkout: true when the gateway's verdict settled it. */
  private async reconcileCheckout(row: StaleCheckoutRow): Promise<boolean> {
    if (!this.factory.has(row.provider)) return false;
    const provider = this.factory.getProvider(row.provider);
    try {
      const result = await provider.queryPayment(
        row.code,
        row.provider_transaction_id ?? undefined,
      );
      if (result.status === PaymentStatusEnum.PENDING) return false;
      await this.settlement.settle(provider.providerName, {
        orderCode: row.code,
        providerTransactionId: result.providerTransactionId,
        amount:
          result.status === PaymentStatusEnum.SUCCESS
            ? result.amountPaid
            : toMinorUnits(1),
        currency: result.currency,
        status: result.status,
        paidAt: result.paidAt,
        rawPayload: {
          source: 'reconciliation',
          result: serialisable(result),
        },
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Reconciling ${row.provider} order ${row.code} failed: ${String(error)}`,
      );
      return false;
    }
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
