import { BadRequestException } from '@nestjs/common';
import { PaymentStatusEnum } from '../../interfaces/index.js';
import { toMinorUnits } from '../../money.js';

export interface StripeSettlementFact {
  orderCode: string;
  providerTransactionId: string;
  amount: bigint;
  currency: string;
  status: PaymentStatusEnum;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const invalid = () => new BadRequestException('INVALID_NOTIFICATION_PAYLOAD');

/** Checkout Session facts we need, validated; shared by webhook and query. */
export function readCheckoutSession(session: unknown) {
  if (
    !isRecord(session) ||
    typeof session.id !== 'string' ||
    typeof session.client_reference_id !== 'string' ||
    typeof session.currency !== 'string' ||
    typeof session.amount_total !== 'number' ||
    !Number.isSafeInteger(session.amount_total) ||
    session.amount_total < 0
  )
    throw invalid();
  return {
    id: session.id,
    orderCode: session.client_reference_id,
    currency: session.currency.toUpperCase(),
    amountTotal: session.amount_total,
    paid: session.payment_status === 'paid',
    expired: session.status === 'expired',
  };
}

/**
 * Maps a (signature-verified) Stripe event to a settlement fact. Event types
 * we do not act on yield PENDING with no order code so the core acknowledges
 * them with 200 and Stripe stops retrying.
 */
export function mapStripeEvent(event: unknown): StripeSettlementFact {
  if (!isRecord(event) || typeof event.type !== 'string') throw invalid();
  const ignored: StripeSettlementFact = {
    orderCode: '',
    providerTransactionId: typeof event.id === 'string' ? event.id : '',
    amount: 0n,
    currency: '',
    status: PaymentStatusEnum.PENDING,
  };
  const status = (() => {
    switch (event.type) {
      case 'checkout.session.async_payment_succeeded':
        return PaymentStatusEnum.SUCCESS;
      case 'checkout.session.async_payment_failed':
        return PaymentStatusEnum.FAILED;
      case 'checkout.session.expired':
        return PaymentStatusEnum.EXPIRED;
      case 'checkout.session.completed':
        return null; // depends on payment_status below
      default:
        return undefined;
    }
  })();
  if (status === undefined) return ignored;

  const data = event.data;
  const session = readCheckoutSession(isRecord(data) ? data.object : undefined);
  return {
    orderCode: session.orderCode,
    providerTransactionId: session.id,
    amount: toMinorUnits(session.amountTotal),
    currency: session.currency,
    // completed + unpaid is a delayed method (bank debit): wait for async_*.
    status:
      status ??
      (session.paid ? PaymentStatusEnum.SUCCESS : PaymentStatusEnum.PENDING),
  };
}
