import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PaymentStatusEnum } from '../../interfaces/index.js';
import type { FetchLike } from '../http-fetch.js';
import { StripeProviderAdapter } from './stripe-provider.adapter.js';
import { signStripePayload } from './stripe-signature.js';

const ENV = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_API_BASE',
] as const;
const input = {
  orderId: 'order-1',
  orderCode: 'SHAN-20261007-X89K',
  amount: 499000n,
  currency: 'VND',
  description: 'Shanity SHAN-20261007-X89K: Khóa học A',
  returnUrl: 'https://app.test/orders/order-1?checkout=success',
  cancelUrl: 'https://app.test/orders/order-1?checkout=cancelled',
};

interface Call {
  url: string;
  init: RequestInit;
  form?: URLSearchParams;
}
const stub = (respond: (call: Call) => Response | Promise<Response>) => {
  const calls: Call[] = [];
  const fetchLike: FetchLike = async (url, init = {}) => {
    const call: Call = {
      url,
      init,
      form: init.body instanceof URLSearchParams ? init.body : undefined,
    };
    calls.push(call);
    return respond(call);
  };
  return { fetchLike, calls };
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('StripeProviderAdapter', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of ENV) saved[key] = process.env[key];
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc';
    delete process.env.STRIPE_API_BASE;
  });
  afterEach(() => {
    for (const key of ENV)
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
  });

  describe('createPayment', () => {
    it('creates a hosted Checkout Session with the frozen amount', async () => {
      const { fetchLike, calls } = stub(() =>
        json({
          id: 'cs_test_1',
          url: 'https://checkout.stripe.com/c/pay/cs_test_1',
          expires_at: 1_800_000_000,
        }),
      );
      const result = await new StripeProviderAdapter(fetchLike).createPayment(
        input,
      );

      expect(result).toMatchObject({
        providerTransactionId: 'cs_test_1',
        paymentUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
        expiresAt: new Date(1_800_000_000 * 1000),
      });
      const [call] = calls;
      expect(call!.url).toBe('https://api.stripe.com/v1/checkout/sessions');
      expect(call!.init.method).toBe('POST');
      expect((call!.init.headers as Record<string, string>).Authorization).toBe(
        'Bearer sk_test_123',
      );
      expect(Object.fromEntries(call!.form!)).toMatchObject({
        mode: 'payment',
        client_reference_id: 'SHAN-20261007-X89K',
        success_url: input.returnUrl,
        cancel_url: input.cancelUrl,
        'line_items[0][quantity]': '1',
        'line_items[0][price_data][currency]': 'vnd',
        'line_items[0][price_data][unit_amount]': '499000',
        'line_items[0][price_data][product_data][name]': input.description,
        'metadata[order_id]': 'order-1',
        'metadata[order_code]': 'SHAN-20261007-X89K',
      });
      // at least Stripe's 30 minute minimum
      const expires = Number(call!.form!.get('expires_at'));
      expect(expires - Date.now() / 1000).toBeGreaterThan(30 * 60);
    });

    it('sends USD in cents and honours STRIPE_API_BASE', async () => {
      process.env.STRIPE_API_BASE = 'http://stripe.local';
      const { fetchLike, calls } = stub(() =>
        json({ id: 'cs_2', url: 'https://x/y' }),
      );
      await new StripeProviderAdapter(fetchLike).createPayment({
        ...input,
        amount: 1999n,
        currency: 'USD',
        cancelUrl: undefined,
      });
      expect(calls[0]!.url).toBe('http://stripe.local/v1/checkout/sessions');
      expect(
        calls[0]!.form!.get('line_items[0][price_data][unit_amount]'),
      ).toBe('1999');
      expect(calls[0]!.form!.get('line_items[0][price_data][currency]')).toBe(
        'usd',
      );
      expect(calls[0]!.form!.get('cancel_url')).toBe(input.returnUrl);
    });

    it('validates input and configuration before calling Stripe', async () => {
      const { fetchLike, calls } = stub(() => json({}));
      const adapter = new StripeProviderAdapter(fetchLike);
      await expect(
        adapter.createPayment({ ...input, currency: 'EUR' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        adapter.createPayment({ ...input, returnUrl: undefined }),
      ).rejects.toThrow(BadRequestException);
      delete process.env.STRIPE_SECRET_KEY;
      await expect(adapter.createPayment(input)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(calls).toHaveLength(0);
    });

    it('maps gateway failures to 502 without leaking Stripe details', async () => {
      const failing = (respond: () => Response | Promise<Response>) =>
        new StripeProviderAdapter(stub(respond).fetchLike).createPayment(input);
      const rejection = await failing(() =>
        json(
          {
            error: { type: 'invalid_request_error', message: 'secret detail' },
          },
          400,
        ),
      ).catch((error: unknown) => error);
      expect(rejection).toBeInstanceOf(BadGatewayException);
      expect(
        JSON.stringify((rejection as BadGatewayException).getResponse()),
      ).not.toContain('secret detail');
      await expect(failing(() => json({ id: 'cs_only' }))).rejects.toThrow(
        BadGatewayException,
      );
      await expect(
        failing(() => new Response('<html>', { status: 200 })),
      ).rejects.toThrow(BadGatewayException);
      await expect(
        failing(() => {
          throw new Error('ECONNRESET');
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });

  describe('verifyNotification', () => {
    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_1',
          client_reference_id: 'SHAN-20261007-X89K',
          amount_total: 499000,
          currency: 'vnd',
          payment_status: 'paid',
        },
      },
    };
    const rawBody = Buffer.from(JSON.stringify(event));
    const adapter = () =>
      new StripeProviderAdapter(stub(() => json({})).fetchLike);
    const signed = (
      secret = 'whsec_abc',
      at = Math.floor(Date.now() / 1000),
    ) => ({
      'stripe-signature': signStripePayload(rawBody, secret, at),
    });

    it('verifies the signature over the raw body and translates the event', async () => {
      const result = await adapter().verifyNotification({
        headers: signed(),
        payload: {},
        rawBody,
      });
      expect(result).toMatchObject({
        isValid: true,
        orderCode: 'SHAN-20261007-X89K',
        providerTransactionId: 'cs_test_1',
        amount: 499000n,
        currency: 'VND',
        status: PaymentStatusEnum.SUCCESS,
      });
      expect(() => JSON.stringify(result.rawPayload)).not.toThrow();
    });

    it('trusts the signed bytes, not the parsed payload argument', async () => {
      const result = await adapter().verifyNotification({
        headers: signed(),
        payload: { forged: true },
        rawBody,
      });
      expect(result.rawPayload).toEqual(event);
    });

    it('rejects a forged, stale, unsigned or body-less request without parsing it', async () => {
      const tampered = Buffer.from(
        JSON.stringify({ ...event, id: 'evt_evil' }),
      );
      const cases = [
        { headers: signed('whsec_wrong'), rawBody },
        {
          headers: signed(undefined, Math.floor(Date.now() / 1000) - 3600),
          rawBody,
        },
        { headers: {}, rawBody },
        { headers: signed(), rawBody: tampered },
        { headers: signed(), rawBody: undefined },
      ];
      for (const attempt of cases) {
        const result = await adapter().verifyNotification({
          payload: {},
          ...attempt,
        });
        expect(result).toMatchObject({
          isValid: false,
          orderCode: '',
          amount: 0n,
        });
      }
      delete process.env.STRIPE_WEBHOOK_SECRET;
      expect(
        (
          await adapter().verifyNotification({
            headers: signed(),
            payload: {},
            rawBody,
          })
        ).isValid,
      ).toBe(false);
    });

    it('acknowledges a signed unrelated event', async () => {
      const other = Buffer.from(
        JSON.stringify({ id: 'evt_2', type: 'customer.created' }),
      );
      const result = await adapter().verifyNotification({
        headers: {
          'stripe-signature': signStripePayload(
            other,
            'whsec_abc',
            Math.floor(Date.now() / 1000),
          ),
        },
        payload: {},
        rawBody: other,
      });
      expect(result).toMatchObject({
        isValid: true,
        status: PaymentStatusEnum.PENDING,
        orderCode: '',
      });
    });
  });

  describe('queryPayment', () => {
    const session = (overrides = {}) => ({
      id: 'cs_test_1',
      client_reference_id: 'SHAN-20261007-X89K',
      amount_total: 499000,
      currency: 'vnd',
      payment_status: 'paid',
      status: 'complete',
      ...overrides,
    });

    it('reports paid, expired and open sessions', async () => {
      const query = (overrides: object) =>
        new StripeProviderAdapter(
          stub(() => json(session(overrides))).fetchLike,
        ).queryPayment('SHAN-20261007-X89K', 'cs_test_1');
      expect(await query({})).toMatchObject({
        status: PaymentStatusEnum.SUCCESS,
        amountPaid: 499000n,
        currency: 'VND',
      });
      expect(
        await query({ payment_status: 'unpaid', status: 'expired' }),
      ).toMatchObject({
        status: PaymentStatusEnum.EXPIRED,
        amountPaid: 0n,
      });
      expect(
        await query({ payment_status: 'unpaid', status: 'open' }),
      ).toMatchObject({
        status: PaymentStatusEnum.PENDING,
      });
    });

    it('requires an id and never answers for another order', async () => {
      const { fetchLike, calls } = stub(() => json(session()));
      const adapter = new StripeProviderAdapter(fetchLike);
      await expect(adapter.queryPayment('SHAN-20261007-X89K')).rejects.toThrow(
        BadRequestException,
      );
      expect(calls).toHaveLength(0);
      await expect(
        adapter.queryPayment('SHAN-20261007-ZZZZ', 'cs_test_1'),
      ).rejects.toThrow(NotFoundException);
      expect(calls[0]!.url).toBe(
        'https://api.stripe.com/v1/checkout/sessions/cs_test_1',
      );
    });
  });
  describe('refundPayment', () => {
    const refundInput = {
      orderCode: 'SHAN-20261007-X89K',
      providerTransactionId: 'cs_test_1',
      amount: 150000n,
      currency: 'VND',
      reason: 'Học viên yêu cầu hoàn tiền',
      idempotencyKey: 'a'.repeat(64),
    };
    const paidSession = {
      id: 'cs_test_1',
      client_reference_id: 'SHAN-20261007-X89K',
      currency: 'vnd',
      amount_total: 499000,
      payment_status: 'paid',
      status: 'complete',
      payment_intent: 'pi_test_1',
    };

    it('refunds the session payment intent with an idempotency key', async () => {
      const { fetchLike, calls } = stub((call) =>
        call.url.endsWith('/v1/refunds')
          ? json({ id: 're_1', status: 'succeeded' })
          : json(paidSession),
      );
      const result = await new StripeProviderAdapter(fetchLike).refundPayment(
        refundInput,
      );
      expect(result).toMatchObject({ providerRefundId: 're_1' });
      expect(calls.map((call) => call.init.method)).toEqual(['GET', 'POST']);
      const refund = calls[1]!;
      expect(refund.url).toBe('https://api.stripe.com/v1/refunds');
      expect(Object.fromEntries(refund.form!)).toMatchObject({
        payment_intent: 'pi_test_1',
        amount: '150000',
        'metadata[order_code]': 'SHAN-20261007-X89K',
      });
      expect(
        (refund.init.headers as Record<string, string>)['Idempotency-Key'],
      ).toBe('a'.repeat(64));
    });

    it('never refunds another order, an unpaid session or a malformed reply', async () => {
      const adapter = (body: unknown, status = 200) => {
        const { fetchLike, calls } = stub(() => json(body, status));
        return { adapter: new StripeProviderAdapter(fetchLike), calls };
      };
      const other = adapter({
        ...paidSession,
        client_reference_id: 'SHAN-OTHER',
      });
      await expect(other.adapter.refundPayment(refundInput)).rejects.toThrow(
        NotFoundException,
      );
      expect(other.calls).toHaveLength(1); // looked up, never refunded

      const unpaid = adapter({ ...paidSession, payment_status: 'unpaid' });
      await expect(unpaid.adapter.refundPayment(refundInput)).rejects.toThrow(
        BadRequestException,
      );
      const noIntent = adapter({ ...paidSession, payment_intent: null });
      await expect(noIntent.adapter.refundPayment(refundInput)).rejects.toThrow(
        BadGatewayException,
      );
      const down = adapter({ error: { type: 'api_error' } }, 500);
      await expect(down.adapter.refundPayment(refundInput)).rejects.toThrow(
        BadGatewayException,
      );
    });
  });
});
