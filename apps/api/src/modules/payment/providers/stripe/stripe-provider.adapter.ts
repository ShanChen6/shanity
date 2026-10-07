import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { fromMinorUnits, toMinorUnits } from '../../money.js';
import {
  PaymentProviderEnum,
  PaymentStatusEnum,
  type CreatePaymentInput,
  type CreatePaymentResult,
  type PaymentProvider,
  type QueryPaymentResult,
  type RefundPaymentInput,
  type RefundPaymentResult,
  type VerifyNotificationInput,
  type VerifyNotificationResult,
} from '../../interfaces/index.js';
import { PAYMENT_HTTP_FETCH, type FetchLike } from '../http-fetch.js';
import { mapStripeEvent, readCheckoutSession } from './stripe-events.js';
import { verifyStripeSignature } from './stripe-signature.js';

const API_BASE_DEFAULT = 'https://api.stripe.com';
const REQUEST_TIMEOUT_MS = 10_000;
// Stripe requires a session to live at least 30 minutes; add a minute of
// margin for clock skew between us and Stripe.
const SESSION_TTL_SECONDS = 31 * 60;

const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Stripe Checkout (hosted page). Talks to the REST API directly: the only
 * Stripe-specific code in the platform lives in this folder.
 *
 * Amounts are Stripe's smallest currency unit, which is exactly the platform's
 * minor unit (VND is zero-decimal in Stripe, USD is cents).
 */
@Injectable()
export class StripeProviderAdapter implements PaymentProvider {
  readonly providerName = PaymentProviderEnum.STRIPE;
  readonly supportedCurrencies = ['VND', 'USD'] as const;
  private readonly logger = new Logger(StripeProviderAdapter.name);

  constructor(@Inject(PAYMENT_HTTP_FETCH) private readonly http: FetchLike) {}

  isAvailable() {
    return Boolean(
      process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET,
    );
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const currency = input.currency.toUpperCase();
    if (!(this.supportedCurrencies as readonly string[]).includes(currency))
      throw new BadRequestException('PAYMENT_CURRENCY_NOT_SUPPORTED');
    if (!input.returnUrl)
      throw new BadRequestException('PAYMENT_RETURN_URL_REQUIRED');

    const expiresAtSeconds =
      Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
    const form = new URLSearchParams({
      mode: 'payment',
      client_reference_id: input.orderCode,
      success_url: input.returnUrl,
      cancel_url: input.cancelUrl ?? input.returnUrl,
      expires_at: String(expiresAtSeconds),
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(
        fromMinorUnits(input.amount),
      ),
      'line_items[0][price_data][product_data][name]': input.description,
      'metadata[order_id]': input.orderId,
      'metadata[order_code]': input.orderCode,
      'payment_intent_data[metadata][order_code]': input.orderCode,
    });
    const session = await this.request('POST', '/v1/checkout/sessions', form);
    if (typeof session.id !== 'string' || typeof session.url !== 'string')
      throw new BadGatewayException('PAYMENT_PROVIDER_BAD_RESPONSE');
    return {
      providerTransactionId: session.id,
      paymentUrl: session.url,
      expiresAt: new Date(
        (typeof session.expires_at === 'number'
          ? session.expires_at
          : expiresAtSeconds) * 1000,
      ),
      rawPayload: session,
    };
  }

  async verifyNotification(
    input: VerifyNotificationInput,
  ): Promise<VerifyNotificationResult> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) this.logger.warn('STRIPE_WEBHOOK_SECRET is not set');
    const authentic =
      !!secret &&
      !!input.rawBody &&
      verifyStripeSignature(
        input.rawBody,
        typeof input.headers['stripe-signature'] === 'string'
          ? input.headers['stripe-signature']
          : undefined,
        secret,
        Math.floor(Date.now() / 1000),
      );
    if (!authentic)
      return {
        isValid: false,
        orderCode: '',
        providerTransactionId: '',
        amount: 0n,
        currency: '',
        status: PaymentStatusEnum.FAILED,
        rawPayload: {},
      };

    // Parse the bytes that were signed, not the framework's parsed copy.
    let event: unknown;
    try {
      event = JSON.parse(input.rawBody!.toString('utf8'));
    } catch {
      throw new BadRequestException('INVALID_NOTIFICATION_PAYLOAD');
    }
    return {
      isValid: true,
      ...mapStripeEvent(event),
      rawPayload: event as Record<string, any>,
    };
  }

  async queryPayment(
    orderCode: string,
    providerTransactionId?: string,
  ): Promise<QueryPaymentResult> {
    if (!providerTransactionId)
      throw new BadRequestException('PROVIDER_TRANSACTION_ID_REQUIRED');
    const raw = await this.request(
      'GET',
      `/v1/checkout/sessions/${encodeURIComponent(providerTransactionId)}`,
    );
    const session = readCheckoutSession(raw);
    // A session id from another order must never answer for this one.
    if (session.orderCode !== orderCode)
      throw new NotFoundException('PAYMENT_NOT_FOUND');
    return {
      status: session.paid
        ? PaymentStatusEnum.SUCCESS
        : session.expired
          ? PaymentStatusEnum.EXPIRED
          : PaymentStatusEnum.PENDING,
      providerTransactionId: session.id,
      amountPaid: session.paid ? toMinorUnits(session.amountTotal) : 0n,
      currency: session.currency,
    };
  }

  /**
   * Refunds (part of) a Checkout payment. The session is looked up for its
   * PaymentIntent, and the caller's idempotency key makes a retry after a lost
   * response return the same refund instead of a second one.
   */
  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const raw = await this.request(
      'GET',
      `/v1/checkout/sessions/${encodeURIComponent(input.providerTransactionId)}`,
    );
    const session = readCheckoutSession(raw);
    // A session id from another order must never be refunded for this one.
    if (session.orderCode !== input.orderCode)
      throw new NotFoundException('PAYMENT_NOT_FOUND');
    if (!session.paid) throw new BadRequestException('PAYMENT_NOT_REFUNDABLE');
    const paymentIntent = raw.payment_intent;
    if (typeof paymentIntent !== 'string' || !paymentIntent)
      throw new BadGatewayException('PAYMENT_PROVIDER_BAD_RESPONSE');

    const refund = await this.request(
      'POST',
      '/v1/refunds',
      new URLSearchParams({
        payment_intent: paymentIntent,
        amount: String(fromMinorUnits(input.amount)),
        'metadata[order_code]': input.orderCode,
        'metadata[reason]': input.reason.slice(0, 500),
      }),
      { 'Idempotency-Key': input.idempotencyKey },
    );
    if (typeof refund.id !== 'string')
      throw new BadGatewayException('PAYMENT_PROVIDER_BAD_RESPONSE');
    return { providerRefundId: refund.id, rawPayload: refund };
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    form?: URLSearchParams,
    extraHeaders: Record<string, string> = {},
  ): Promise<Record<string, any>> {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey)
      throw new ServiceUnavailableException('PAYMENT_PROVIDER_NOT_CONFIGURED');
    const base = process.env.STRIPE_API_BASE ?? API_BASE_DEFAULT;
    let response: Response;
    try {
      response = await this.http(`${base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${secretKey}`,
          ...extraHeaders,
          ...(form && {
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        },
        body: form,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(`Stripe ${method} ${path} failed`, String(error));
      throw new BadGatewayException('PAYMENT_PROVIDER_UNREACHABLE');
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(body)) {
      const detail = isRecord(body) && isRecord(body.error) ? body.error : {};
      this.logger.error(
        `Stripe ${method} ${path} -> ${response.status} ${String(detail.type)} ${String(detail.code)}: ${String(detail.message)}`,
      );
      throw new BadGatewayException('PAYMENT_PROVIDER_REQUEST_FAILED');
    }
    return body;
  }
}
