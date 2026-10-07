import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../../database/database.module.js';
import { OrderCompletedEvent } from '../events/order-completed.event.js';
import { PaymentEventBus } from '../events/payment-event-bus.js';
import { OrderAuditAction } from '../entities/order-audit-log.entity.js';
import { OrderItem } from '../entities/order-item.entity.js';
import { Order, OrderStatus } from '../entities/order.entity.js';
import { PaymentTransactionStatus } from '../entities/payment-transaction.entity.js';
import { MANUAL_RECONCILED } from '../interfaces/payment-provider.enum.js';
import { orderLookup } from '../order-ref.js';
import {
  isBackOffice,
  OrderAuditService,
  type AdminRequestContext,
} from '../order-audit.service.js';
import { PaymentTransactionService } from '../payment-transaction.service.js';
import { AdminOrderQueryService } from './admin-order-query.service.js';
import type { AdminOrderDetail } from './admin-order.view.js';
import type { ReconcileOrderDto } from './admin-orders.dto.js';
import { proofUrl } from './payment-proof.service.js';

export interface ReconcileResult {
  order: AdminOrderDetail;
  /** false when the fulfilment listener failed; the reconciler will retry. */
  enrollmentGranted: boolean;
}

/**
 * The ONLY way back-office staff can mark an unpaid order as paid.
 *
 * A student paid but the webhook was lost (or the memo was wrong). Staff must
 * name the real bank transaction, say why, and may attach proof. In ONE
 * database transaction, with the order row locked:
 *
 *   1. a SUCCESS payment_transactions row for provider MANUAL_RECONCILED
 *   2. a MANUAL_RECONCILED audit row (admin, IP, user agent, reason, states)
 *   3. only then the order moves to COMPLETED
 *
 * PostgreSQL enforces the shape: the order cannot become COMPLETED unless
 * SUCCESS payments cover its total, and a MANUAL_RECONCILED payment cannot
 * commit without its audit row. After COMMIT the standard
 * `OrderCompletedEvent` grants the enrollment.
 */
@Injectable()
export class OrderReconciliationService {
  private readonly logger = new Logger(OrderReconciliationService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly ledger: PaymentTransactionService,
    private readonly audit: OrderAuditService,
    private readonly events: PaymentEventBus,
    private readonly queries: AdminOrderQueryService,
  ) {}

  async reconcile(
    ref: string,
    dto: ReconcileOrderDto,
    context: AdminRequestContext,
  ): Promise<ReconcileResult> {
    if (!isBackOffice(context.principal)) throw new ForbiddenException();
    const lookup = orderLookup(ref);
    if (!lookup) throw new NotFoundException('ORDER_NOT_FOUND');

    const queryRunner = this.database.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let completed: OrderCompletedEvent;
    try {
      const { manager } = queryRunner;
      // 1. Lock. Concurrent webhooks / reconciliations queue behind us.
      const order = await manager.findOne(Order, {
        where: lookup,
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');
      if (
        order.status !== OrderStatus.PENDING &&
        order.status !== OrderStatus.EXPIRED
      )
        throw new ConflictException('ORDER_NOT_RECONCILABLE');
      if (dto.amountReceived < order.finalTotal)
        throw new BadRequestException('AMOUNT_BELOW_ORDER_TOTAL');

      const proof = await this.checkProof(manager, order.id, dto.proofImageUrl);

      // A bank transaction can back one payment only, whichever way it got
      // booked (webhook under the real provider, or an earlier manual entry).
      const [duplicate] = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM payment_transactions
          WHERE provider_transaction_id = $1 AND provider::text = ANY($2) LIMIT 1`,
        [dto.providerTransactionId, [dto.provider, MANUAL_RECONCILED]],
      );
      if (duplicate)
        throw new ConflictException('PROVIDER_TRANSACTION_ALREADY_RECORDED');

      const actor = await this.audit.adminActor(manager, context);
      const before = await this.ledger.refundTotals(manager, order.id);

      // 2. Ledger: the money, as a SUCCESS row of provider MANUAL_RECONCILED.
      const { transaction, created } = await this.ledger.record(manager, {
        orderId: order.id,
        provider: MANUAL_RECONCILED,
        providerTransactionId: dto.providerTransactionId,
        amount: dto.amountReceived,
        currency: order.currency,
        status: PaymentTransactionStatus.SUCCESS,
        rawPayload: {
          reconciliation: {
            source: 'ADMIN_MANUAL_RECONCILIATION',
            declaredProvider: dto.provider,
            note: dto.note,
            proofImageUrl: proof,
            actor: { id: actor.id, email: actor.email },
            previousStatus: order.status,
          },
        },
      });
      if (!created)
        throw new ConflictException('PROVIDER_TRANSACTION_ALREADY_RECORDED');

      // 3. Audit: who, from where, why, and the before/after states.
      await this.audit.append(manager, {
        orderId: order.id,
        actor,
        action: OrderAuditAction.MANUAL_RECONCILED,
        reason: dto.note,
        previousState: { status: order.status, paidTotal: before.paid },
        newState: {
          status: OrderStatus.COMPLETED,
          paymentTransactionId: transaction.id,
          providerTransactionId: dto.providerTransactionId,
          declaredProvider: dto.provider,
          amountReceived: dto.amountReceived,
          orderTotal: order.finalTotal,
          overpaidBy: dto.amountReceived - order.finalTotal,
          currency: order.currency,
          proofImageUrl: proof,
        },
      });

      // 4. Only now does the order change.
      await manager.update(
        Order,
        { id: order.id },
        {
          status: OrderStatus.COMPLETED,
        },
      );
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
      await queryRunner.commitTransaction();
    } catch (error) {
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // After COMMIT, like every other completion: listeners see durable state
    // and a rolled-back reconciliation can never grant access.
    const failures = await this.events.publish(completed);
    if (failures.length)
      this.logger.warn(
        `Order ${completed.orderCode} reconciled but enrollment failed; the fulfilment reconciler will retry`,
      );
    return {
      order: await this.queries.load(
        this.database.dataSource.manager,
        completed.orderId,
      ),
      enrollmentGranted: failures.length === 0,
    };
  }

  /**
   * A proof is either a file uploaded to *this* order (registered in the audit
   * trail) or an https link. Anything else (javascript:, another order's
   * file...) is rejected so the stored value is always safe to render.
   */
  private async checkProof(
    manager: Parameters<OrderAuditService['hasProofUpload']>[0],
    orderId: string,
    value: string | undefined,
  ): Promise<string | null> {
    if (!value) return null;
    const internal = new RegExp(
      `^${proofUrl(orderId, '').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^/?#]+)$`,
    ).exec(value);
    if (internal) {
      if (!(await this.audit.hasProofUpload(manager, orderId, internal[1]!)))
        throw new BadRequestException('PROOF_NOT_FOUND');
      return value;
    }
    try {
      if (new URL(value).protocol === 'https:') return value;
    } catch {
      // fall through
    }
    throw new BadRequestException('PROOF_URL_INVALID');
  }
}
