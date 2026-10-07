import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { CourseCurrency } from '../../courses/course-currency.js';
import { DatabaseService } from '../../database/database.module.js';
import { Order, OrderStatus } from './entities/order.entity.js';
import {
  PaymentProvider,
  PaymentTransaction,
  PaymentTransactionStatus,
} from './entities/payment-transaction.entity.js';

export interface RecordPaymentInput {
  orderId: string;
  provider: PaymentProvider;
  providerTransactionId: string | null;
  amount: number;
  currency: CourseCurrency;
  status: PaymentTransactionStatus;
  rawPayload: Record<string, unknown>;
  feeAmount?: number;
  transferContent?: string | null;
  receivedAt?: Date;
}

export interface RecordedPayment {
  transaction: PaymentTransaction;
  /** false when the (provider, providerTransactionId) event already existed. */
  created: boolean;
}

export interface RecordRefundInput {
  orderId: string;
  provider: PaymentProvider;
  /** Provider refund id; makes the call idempotent. */
  providerTransactionId: string;
  amount: number;
  rawPayload: Record<string, unknown>;
  feeAmount?: number;
}

const PROVIDER_ID_MAX = 100;
const isPositiveSafeInteger = (value: number) =>
  Number.isSafeInteger(value) && value > 0;

@Injectable()
export class PaymentTransactionService {
  constructor(private readonly database: DatabaseService) {}

  /**
   * Appends one payment event to the ledger inside the caller's transaction
   * (so it commits atomically with the order/enrollment change it explains).
   * Idempotent per provider event: re-recording returns the stored row.
   */
  async record(
    manager: EntityManager,
    input: RecordPaymentInput,
  ): Promise<RecordedPayment> {
    this.validate(input);
    const repository = manager.getRepository(PaymentTransaction);
    // Raw SQL: ON CONFLICT DO NOTHING + RETURNING tells us atomically whether
    // this provider event was new, without aborting the caller's transaction.
    const inserted = await manager.query<Array<{ id: string }>>(
      `INSERT INTO payment_transactions
         (order_id, provider, provider_transaction_id, amount, fee_amount,
          currency, transfer_content, status, raw_payload, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        input.orderId,
        input.provider,
        input.providerTransactionId,
        input.amount,
        input.feeAmount ?? 0,
        input.currency,
        input.transferContent ?? null,
        input.status,
        JSON.stringify(input.rawPayload),
        input.receivedAt ?? new Date(),
      ],
    );
    const insertedId = inserted[0]?.id;
    if (insertedId)
      return {
        transaction: await repository.findOneByOrFail({ id: insertedId }),
        created: true,
      };

    // ON CONFLICT DO NOTHING fired: the provider event is already recorded.
    const existing =
      input.providerTransactionId === null
        ? null
        : await repository.findOneBy({
            provider: input.provider,
            providerTransactionId: input.providerTransactionId,
          });
    if (!existing || existing.orderId !== input.orderId)
      throw new ConflictException('PROVIDER_TRANSACTION_ID_REUSED');
    return { transaction: existing, created: false };
  }

  listByOrder(orderId: string, manager?: EntityManager) {
    return (manager ?? this.database.dataSource.manager)
      .getRepository(PaymentTransaction)
      .find({
        where: { orderId },
        order: { receivedAt: 'ASC', createdAt: 'ASC', id: 'ASC' },
      });
  }

  /**
   * Records a (partial) refund as a new ledger row. The order is locked so
   * concurrent refunds cannot exceed what was paid; a full refund moves a
   * COMPLETED order to REFUNDED. Course access is not revoked here.
   */
  async recordRefund(input: RecordRefundInput): Promise<RecordedPayment> {
    if (!isPositiveSafeInteger(input.amount))
      throw new BadRequestException('REFUND_AMOUNT_MUST_BE_POSITIVE');
    return this.database.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        where: { id: input.orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('ORDER_NOT_FOUND');

      const prior = await manager.getRepository(PaymentTransaction).findOneBy({
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
      });
      if (prior) {
        if (prior.orderId !== order.id)
          throw new ConflictException('PROVIDER_TRANSACTION_ID_REUSED');
        return { transaction: prior, created: false };
      }
      if (order.status !== OrderStatus.COMPLETED)
        throw new ConflictException('ORDER_NOT_REFUNDABLE');

      const [totals] = await manager.query<
        Array<{ paid: string; refunded: string }>
      >(
        `SELECT
           COALESCE(sum(amount) FILTER (WHERE status = 'SUCCESS'), 0)::text AS paid,
           COALESCE(sum(amount) FILTER (WHERE status IN ('REFUNDED','PARTIALLY_REFUNDED')), 0)::text AS refunded
         FROM payment_transactions WHERE order_id = $1`,
        [order.id],
      );
      const refundable = Number(totals!.paid) - Number(totals!.refunded);
      if (input.amount > refundable)
        throw new BadRequestException('REFUND_EXCEEDS_PAID_AMOUNT');

      const fullyRefunded = input.amount === refundable;
      const recorded = await this.record(manager, {
        orderId: order.id,
        provider: input.provider,
        providerTransactionId: input.providerTransactionId,
        amount: input.amount,
        feeAmount: input.feeAmount,
        currency: order.currency,
        status: fullyRefunded
          ? PaymentTransactionStatus.REFUNDED
          : PaymentTransactionStatus.PARTIALLY_REFUNDED,
        rawPayload: input.rawPayload,
      });
      if (fullyRefunded)
        await manager
          .getRepository(Order)
          .update({ id: order.id }, { status: OrderStatus.REFUNDED });
      return recorded;
    });
  }

  private validate(input: RecordPaymentInput) {
    if (!isPositiveSafeInteger(input.amount))
      throw new BadRequestException('PAYMENT_AMOUNT_MUST_BE_POSITIVE');
    const fee = input.feeAmount ?? 0;
    if (!Number.isSafeInteger(fee) || fee < 0 || fee > input.amount)
      throw new BadRequestException('PAYMENT_FEE_OUT_OF_RANGE');
    if (
      input.providerTransactionId !== null &&
      (input.providerTransactionId.length === 0 ||
        input.providerTransactionId.length > PROVIDER_ID_MAX)
    )
      throw new BadRequestException('PROVIDER_TRANSACTION_ID_INVALID');
  }
}
