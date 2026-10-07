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
  PaymentTransaction,
  PaymentTransactionStatus,
} from './entities/payment-transaction.entity.js';
import type {
  PaymentLedgerReader,
  PaymentProviderEnum,
  VerifiedPaymentRecord,
} from './interfaces/index.js';

export interface RecordPaymentInput {
  orderId: string;
  provider: PaymentProviderEnum;
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
  provider: PaymentProviderEnum;
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
export class PaymentTransactionService implements PaymentLedgerReader {
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

  findByProviderTransaction(
    manager: EntityManager,
    provider: PaymentProviderEnum,
    providerTransactionId: string,
  ) {
    return manager
      .getRepository(PaymentTransaction)
      .findOneBy({ provider, providerTransactionId });
  }

  /**
   * Books the outcome of a provider attempt. If checkout left an INITIATED row
   * for this provider (matched by provider transaction id, else the newest
   * attempt for the order) that row is completed in place; otherwise a new row
   * is appended. A provider event that was already settled is returned
   * untouched with `created: false`, which is what makes redelivery safe.
   *
   * The caller must hold the order lock so concurrent settlements of the same
   * order are serialised.
   */
  async settle(
    manager: EntityManager,
    input: RecordPaymentInput,
  ): Promise<RecordedPayment> {
    this.validate(input);
    const existing = input.providerTransactionId
      ? await this.findByProviderTransaction(
          manager,
          input.provider,
          input.providerTransactionId,
        )
      : null;
    if (existing && existing.orderId !== input.orderId)
      throw new ConflictException('PROVIDER_TRANSACTION_ID_REUSED');
    if (existing && existing.status !== PaymentTransactionStatus.INITIATED)
      return { transaction: existing, created: false };

    const initiated =
      existing ??
      (await manager.getRepository(PaymentTransaction).findOne({
        where: {
          orderId: input.orderId,
          provider: input.provider,
          status: PaymentTransactionStatus.INITIATED,
        },
        order: { createdAt: 'DESC', id: 'DESC' },
      }));
    if (!initiated) return this.record(manager, input);

    // Allowed by the ledger guard: INITIATED rows may be completed once.
    await manager.query(
      `UPDATE payment_transactions
          SET status = $2, provider_transaction_id = $3, amount = $4,
              fee_amount = $5, currency = $6, transfer_content = $7,
              raw_payload = $8::jsonb, received_at = $9, updated_at = now()
        WHERE id = $1 AND status = 'INITIATED'`,
      [
        initiated.id,
        input.status,
        input.providerTransactionId,
        input.amount,
        input.feeAmount ?? 0,
        input.currency,
        input.transferContent ?? null,
        JSON.stringify(input.rawPayload),
        input.receivedAt ?? new Date(),
      ],
    );
    return {
      transaction: await manager
        .getRepository(PaymentTransaction)
        .findOneByOrFail({ id: initiated.id }),
      created: true,
    };
  }

  /** PaymentLedgerReader: what a push-only gateway has already proven. */
  async findSuccessfulPayment(
    provider: PaymentProviderEnum,
    orderCode: string,
  ): Promise<VerifiedPaymentRecord | null> {
    const [row] = await this.database.dataSource.query<
      Array<{
        provider_transaction_id: string;
        amount: string;
        currency: string;
        received_at: Date;
      }>
    >(
      `SELECT t.provider_transaction_id, t.amount::text AS amount, t.currency, t.received_at
         FROM payment_transactions t JOIN orders o ON o.id = t.order_id
        WHERE o.code = $1 AND t.provider = $2 AND t.status = 'SUCCESS'
        ORDER BY t.received_at DESC LIMIT 1`,
      [orderCode, provider],
    );
    return row
      ? {
          providerTransactionId: row.provider_transaction_id,
          amount: Number(row.amount),
          currency: row.currency,
          receivedAt: row.received_at,
        }
      : null;
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
