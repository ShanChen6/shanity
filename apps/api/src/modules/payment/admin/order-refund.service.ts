import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService } from '../../../database/database.module.js';
import { OrderAuditAction } from '../entities/order-audit-log.entity.js';
import { Order, OrderStatus } from '../entities/order.entity.js';
import {
  PaymentTransaction,
  PaymentTransactionStatus,
} from '../entities/payment-transaction.entity.js';
import {
  PaymentProviderEnum,
  type LedgerProvider,
} from '../interfaces/payment-provider.enum.js';
import { OrderNotifier } from '../order-notifier.js';
import { orderLookup } from '../order-ref.js';
import {
  isBackOffice,
  OrderAuditService,
  type AdminRequestContext,
} from '../order-audit.service.js';
import { PaymentProviderFactory } from '../payment-provider.factory.js';
import { PaymentTransactionService } from '../payment-transaction.service.js';
import { AdminOrderQueryService } from './admin-order-query.service.js';
import type { AdminOrderDetail } from './admin-order.view.js';
import type { RefundOrderDto } from './admin-orders.dto.js';

export interface RefundResult {
  order: AdminOrderDetail;
  refund: {
    amount: number;
    status: 'PARTIALLY_REFUNDED' | 'REFUNDED';
    /** PROVIDER_API: the gateway refunded; INTERNAL: recorded for a manual payout. */
    mode: 'PROVIDER_API' | 'INTERNAL';
    providerTransactionId: string;
    enrollmentsRevoked: number;
  };
}

/**
 * Refund workflow (COMPLETED orders only). Under the order lock and in one
 * transaction: ask the gateway to refund when it can (otherwise the refund is
 * recorded for a manual bank payout), write the refund ledger row and the
 * REFUND_ISSUED audit row, and on a FULL refund move the order to REFUNDED and
 * revoke the student's access, each revocation audited too.
 *
 * A partial refund leaves the order COMPLETED (access stays); its refunded
 * share shows as `refundStatus: PARTIALLY_REFUNDED` on the ledger-derived
 * summary and as a PARTIALLY_REFUNDED ledger row.
 */
@Injectable()
export class OrderRefundService {
  private readonly logger = new Logger(OrderRefundService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly ledger: PaymentTransactionService,
    private readonly audit: OrderAuditService,
    private readonly providers: PaymentProviderFactory,
    private readonly notifier: OrderNotifier,
    private readonly queries: AdminOrderQueryService,
  ) {}

  async refund(
    ref: string,
    dto: RefundOrderDto,
    context: AdminRequestContext,
  ): Promise<RefundResult> {
    if (!isBackOffice(context.principal)) throw new ForbiddenException();
    const lookup = orderLookup(ref);
    if (!lookup) throw new NotFoundException('ORDER_NOT_FOUND');

    const outcome = await this.database.dataSource.transaction(
      async (manager) => {
        const order = await manager.findOne(Order, {
          where: lookup,
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
        if (order.status !== OrderStatus.COMPLETED)
          throw new ConflictException('ORDER_NOT_REFUNDABLE');

        const totals = await this.ledger.refundTotals(manager, order.id);
        if (dto.refundAmount > totals.refundable)
          throw new BadRequestException('REFUND_EXCEEDS_REFUNDABLE');

        const payment = await manager
          .getRepository(PaymentTransaction)
          .findOne({
            where: {
              orderId: order.id,
              status: PaymentTransactionStatus.SUCCESS,
            },
            order: { receivedAt: 'DESC', id: 'DESC' },
          });
        if (!payment) throw new ConflictException('ORDER_NOT_REFUNDABLE');
        const actor = await this.audit.adminActor(manager, context);

        // The gateway call happens under the order lock, before anything is
        // written: if it fails, nothing is recorded and the lock is released.
        // The idempotency key makes a retried request return the same refund.
        const gateway = this.refundCapableGateway(payment.provider);
        let mode: 'PROVIDER_API' | 'INTERNAL' = 'INTERNAL';
        let providerTransactionId: string;
        let gatewayPayload: Record<string, unknown> | null = null;
        if (gateway && payment.providerTransactionId) {
          const result = await gateway.refundPayment!({
            orderCode: order.code,
            providerTransactionId: payment.providerTransactionId,
            amount: BigInt(dto.refundAmount),
            currency: order.currency,
            reason: dto.reason,
            idempotencyKey: createHash('sha256')
              .update(
                `refund:${order.id}:${totals.refunded}:${dto.refundAmount}`,
              )
              .digest('hex'),
          });
          mode = 'PROVIDER_API';
          providerTransactionId = result.providerRefundId;
          gatewayPayload = result.rawPayload;
        } else {
          const [{ count }] = await manager.query<Array<{ count: string }>>(
            `SELECT count(*)::text AS count FROM payment_transactions
              WHERE order_id = $1 AND status IN ('REFUNDED','PARTIALLY_REFUNDED')`,
            [order.id],
          );
          providerTransactionId = `INTERNAL-REFUND-${order.code}-${Number(count) + 1}`;
        }

        const recorded = await this.ledger.recordRefundLocked(
          manager,
          order,
          {
            orderId: order.id,
            provider: payment.provider,
            providerTransactionId,
            amount: dto.refundAmount,
            rawPayload: {
              refund: {
                source: 'ADMIN_REFUND',
                mode,
                reason: dto.reason,
                notifyStudent: dto.notifyStudent,
                actor: { id: actor.id, email: actor.email },
                originalPaymentTransactionId: payment.id,
                gateway: gatewayPayload,
              },
            },
          },
          {
            actor,
            reason: dto.reason,
            metadata: { mode, notifyStudent: dto.notifyStudent },
          },
        );

        let enrollmentsRevoked = 0;
        if (recorded.fullyRefunded) {
          enrollmentsRevoked = await this.revokeAccess(
            manager,
            order,
            actor,
            dto.reason,
          );
        }
        const [student] = await manager.query<Array<{ email: string }>>(
          'SELECT email FROM users WHERE id = $1',
          [order.userId],
        );
        return {
          orderId: order.id,
          orderCode: order.code,
          currency: order.currency,
          studentEmail: student?.email ?? '',
          mode,
          providerTransactionId,
          fullyRefunded: recorded.fullyRefunded,
          enrollmentsRevoked,
        };
      },
    );

    if (dto.notifyStudent)
      await this.notifier
        .refundIssued({
          orderCode: outcome.orderCode,
          studentEmail: outcome.studentEmail,
          amount: dto.refundAmount,
          currency: outcome.currency,
          fullyRefunded: outcome.fullyRefunded,
        })
        .catch((error: unknown) =>
          this.logger.error(
            `Refund notice for ${outcome.orderCode} failed: ${String(error)}`,
          ),
        );

    return {
      order: await this.queries.load(
        this.database.dataSource.manager,
        outcome.orderId,
      ),
      refund: {
        amount: dto.refundAmount,
        status: outcome.fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        mode: outcome.mode,
        providerTransactionId: outcome.providerTransactionId,
        enrollmentsRevoked: outcome.enrollmentsRevoked,
      },
    };
  }

  private refundCapableGateway(provider: LedgerProvider) {
    if (!Object.values(PaymentProviderEnum).includes(provider as never))
      return null;
    const name = provider as PaymentProviderEnum;
    if (!this.providers.has(name)) return null;
    const gateway = this.providers.getProvider(name);
    return gateway.refundPayment && (gateway.isAvailable?.() ?? true)
      ? gateway
      : null;
  }

  /**
   * Revokes the buyer's access to every course on the refunded order, unless
   * another COMPLETED order of theirs still covers that course. One
   * ENROLLMENT_REVOKED audit row lists what was revoked.
   */
  private async revokeAccess(
    manager: Parameters<OrderAuditService['append']>[0],
    order: Order,
    actor: Awaited<ReturnType<OrderAuditService['adminActor']>>,
    reason: string,
  ) {
    const revoked = await manager.query<Array<{ course_id: string }>>(
      `UPDATE enrollments e SET revoked_at = now()
        WHERE e.user_id = $1
          AND e.course_id IN (SELECT course_id FROM order_items WHERE order_id = $2)
          AND e.revoked_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM orders o JOIN order_items i ON i.order_id = o.id
             WHERE o.user_id = e.user_id AND o.status = 'COMPLETED'
               AND o.id <> $2 AND i.course_id = e.course_id)
        RETURNING e.course_id`,
      [order.userId, order.id],
    );
    // `UPDATE ... RETURNING` through TypeORM yields [rows, count].
    const rows = (Array.isArray(revoked[0]) ? revoked[0] : revoked) as Array<{
      course_id: string;
    }>;
    if (rows.length > 0)
      await this.audit.append(manager, {
        orderId: order.id,
        actor,
        action: OrderAuditAction.ENROLLMENT_REVOKED,
        reason: `Full refund: ${reason}`,
        previousState: { enrollment: 'ACTIVE' },
        newState: {
          enrollment: 'REVOKED',
          courseIds: rows.map((row) => row.course_id),
        },
      });
    return rows.length;
  }
}
