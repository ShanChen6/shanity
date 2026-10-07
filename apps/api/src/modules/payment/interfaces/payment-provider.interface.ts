import type {
  PaymentProviderEnum,
  PaymentStatusEnum,
} from './payment-provider.enum.js';

/**
 * Contract between the core payment domain and a concrete gateway.
 *
 * Money is `bigint` in the currency's minor unit (VND dong, USD cents) so no
 * floating point ever touches an amount. Every `rawPayload` must be plain
 * JSON (it is persisted to the audit ledger), so it never contains bigint.
 */
export interface CreatePaymentInput {
  orderId: string;
  orderCode: string;
  amount: bigint;
  currency: string;
  description: string;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CreatePaymentResult {
  /** The provider's id for this attempt (Stripe session id, QR reference...). */
  providerTransactionId: string;
  /** Hosted page to redirect the buyer to. */
  paymentUrl?: string;
  /** Image URL of a scannable code. */
  qrCodeUrl?: string;
  /**
   * Latest moment the buyer can still pay through this attempt. The order is
   * kept payable at least this long so a payment made inside the provider's
   * own window is never rejected as "expired".
   */
  expiresAt?: Date;
  /** Manual bank-transfer instructions to show next to the QR (copy buttons). */
  transfer?: BankTransferInstructions;
  rawPayload: Record<string, any>;
}

export interface BankTransferInstructions {
  bankId: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  /** Minor units. */
  amount: number;
  /** The memo the payer must type; carries the order code. */
  content: string;
}

export interface VerifyNotificationInput {
  headers: Record<string, any>;
  payload: Record<string, any>;
  /** Exact bytes received; required to check signatures over the body. */
  rawBody?: Buffer;
}

export interface VerifyNotificationResult {
  /** false => authenticity not proven; nothing else in the result is trusted. */
  isValid: boolean;
  orderCode: string;
  providerTransactionId: string;
  amount: bigint;
  currency: string;
  status: PaymentStatusEnum;
  /** Free-text reference the payer supplied (bank memo), kept for audit. */
  memo?: string;
  /** The provider's id for this delivery (e.g. Stripe `evt_…`), when it has one. */
  eventId?: string;
  /**
   * When the payer actually paid, if the provider says so. Lets a webhook that
   * is delivered late still fulfil an order that expired in the meantime.
   */
  paidAt?: Date;
  rawPayload: Record<string, any>;
}

export interface QueryPaymentResult {
  status: PaymentStatusEnum;
  providerTransactionId: string;
  amountPaid: bigint;
  currency: string;
  paidAt?: Date;
}

export interface RefundPaymentInput {
  orderCode: string;
  /** The provider's id of the payment being refunded (Stripe session id...). */
  providerTransactionId: string;
  /** Minor units; at most what is still refundable. */
  amount: bigint;
  currency: string;
  /** Why; forwarded to the gateway for its own records. */
  reason: string;
  /** Same key => same refund, so a retried request can never refund twice. */
  idempotencyKey: string;
}

export interface RefundPaymentResult {
  /** The provider's id for the refund; becomes the refund ledger row's id. */
  providerRefundId: string;
  rawPayload: Record<string, any>;
}

export interface PaymentProvider {
  readonly providerName: PaymentProviderEnum;
  /** ISO 4217 codes this gateway can charge. Checked before createPayment. */
  readonly supportedCurrencies: readonly string[];
  /** Whether the gateway is configured and usable right now (default: yes). */
  isAvailable?(): boolean;

  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /**
   * Authenticates an asynchronous notification (webhook / IPN) — signature,
   * HMAC or shared secret — and translates it. Must never throw for a forged
   * request: return `isValid: false` so the caller can reject it uniformly.
   */
  verifyNotification(
    input: VerifyNotificationInput,
  ): Promise<VerifyNotificationResult>;

  /** Asks the gateway (or its verified history) what happened to a payment. */
  queryPayment(
    orderCode: string,
    providerTransactionId?: string,
  ): Promise<QueryPaymentResult>;

  /**
   * Hands money back through the gateway. Optional: a bank transfer has no
   * refund API, so the platform records an internal refund instead.
   */
  refundPayment?(input: RefundPaymentInput): Promise<RefundPaymentResult>;
}

/** Injection token for the list of registered concrete providers. */
export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');

/**
 * Read port for gateways that are push-only (a bank transfer has no API to
 * ask "was I paid?"): their `queryPayment` answers from the notifications the
 * platform already verified and recorded.
 */
export interface VerifiedPaymentRecord {
  providerTransactionId: string;
  amount: number;
  currency: string;
  receivedAt: Date;
}

export interface PaymentLedgerReader {
  findSuccessfulPayment(
    provider: PaymentProviderEnum,
    orderCode: string,
  ): Promise<VerifiedPaymentRecord | null>;
}

export const PAYMENT_LEDGER_READER = Symbol('PAYMENT_LEDGER_READER');
