import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { OrderCompletedEvent } from '../../../src/modules/payment/events/order-completed.event.js';
import { PaymentEventBus } from '../../../src/modules/payment/events/payment-event-bus.js';
import {
  PAYMENT_PROVIDERS,
  PaymentProviderEnum,
  PaymentStatusEnum,
  type PaymentProvider,
} from '../../../src/modules/payment/interfaces/index.js';
import { PaymentReconciliationService } from '../../../src/modules/payment/payment-reconciliation.service.js';
import { hmacSha256Hex } from '../../../src/modules/payment/providers/secrets.js';
import {
  PAYMENT_HTTP_FETCH,
  type FetchLike,
} from '../../../src/modules/payment/providers/http-fetch.js';
import { StripeProviderAdapter } from '../../../src/modules/payment/providers/stripe/stripe-provider.adapter.js';
import { signStripePayload } from '../../../src/modules/payment/providers/stripe/stripe-signature.js';
import { VietQRProviderAdapter } from '../../../src/modules/payment/providers/vietqr/vietqr-provider.adapter.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

const STRIPE_WEBHOOK_SECRET = 'whsec_checkout_spec';
const uid = () => randomUUID().replaceAll('-', '').slice(0, 10);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

// A third gateway that exists only in this test: proves a new provider plugs in
// without touching checkout, webhook, order or enrolment code.
class FakeMomoProvider implements PaymentProvider {
  readonly providerName = PaymentProviderEnum.MOMO;
  readonly supportedCurrencies = ['VND'] as const;
  createPayment(input: { orderCode: string; amount: bigint }) {
    return Promise.resolve({
      providerTransactionId: `MOMO-${input.orderCode}`,
      paymentUrl: `https://momo.test/pay?amount=${input.amount}`,
      rawPayload: { gateway: 'fake-momo' },
    });
  }
  verifyNotification(input: {
    headers: Record<string, any>;
    payload: Record<string, any>;
  }) {
    const ok = input.headers['x-momo-secret'] === 'momo-secret';
    return Promise.resolve({
      isValid: ok,
      orderCode: ok ? String(input.payload.order) : '',
      providerTransactionId: ok ? String(input.payload.trx) : '',
      amount: ok ? BigInt(input.payload.amount as number) : 0n,
      currency: 'VND',
      status: ok ? PaymentStatusEnum.SUCCESS : PaymentStatusEnum.FAILED,
      rawPayload: input.payload,
    });
  }
  queryPayment() {
    return Promise.resolve({
      status: PaymentStatusEnum.PENDING,
      providerTransactionId: '',
      amountPaid: 0n,
      currency: 'VND',
    });
  }
}

describe(
  'PAY6-9 checkout, provider abstraction and fulfilment',
  { timeout: 30_000 },
  () => {
    let t: Awaited<ReturnType<typeof learningApp>>;
    let owner: Account;
    let stripeHttp: FetchLike;
    const bankKey = `bank-${uid()}${uid()}${uid()}`;
    const stripeCalls: Array<{ url: string; form?: URLSearchParams }> = [];

    beforeAll(async () => {
      Object.assign(process.env, {
        BANK_WEBHOOK_API_KEY: bankKey,
        VIETQR_BANK_ID: '970422',
        VIETQR_ACCOUNT_NO: '123456789',
        VIETQR_ACCOUNT_NAME: 'SHANITY',
        STRIPE_SECRET_KEY: 'sk_test_spec',
        STRIPE_WEBHOOK_SECRET,
      });
      stripeHttp = () => Promise.reject(new Error('unexpected Stripe call'));
      t = await learningApp('checkout-webhook', (builder) =>
        builder.overrideProvider(PAYMENT_HTTP_FETCH).useValue(((url, init) => {
          stripeCalls.push({
            url,
            form: init?.body instanceof URLSearchParams ? init.body : undefined,
          });
          return stripeHttp(url, init);
        }) satisfies FetchLike),
      );
      owner = await t.account('instructor');
    });

    afterAll(async () => {
      await t?.app.close();
      for (const key of [
        'BANK_WEBHOOK_API_KEY',
        'BANK_WEBHOOK_HMAC_SECRET',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
      ])
        delete process.env[key];
    });

    // ------------------------------------------------------------- helpers
    async function paidCourse(price: number, currency: 'VND' | 'USD' = 'VND') {
      const course = await t.course(owner, 1);
      await t
        .send('patch', `/courses/${course.id}/pricing`, owner.session, {
          accessType: 'PAID',
          price,
          currency,
        })
        .expect(200);
      return course.id;
    }
    const order = async (student: Account, courseIds: string[]) =>
      (
        await t
          .http()
          .post('/orders')
          .set('Origin', process.env.WEB_ORIGIN!)
          .set('Cookie', student.session)
          .send({ courseIds })
          .expect(201)
      ).body;
    const checkout = (student: Account, orderId: string, body: object) =>
      t
        .http()
        .post(`/orders/${orderId}/checkout`)
        .set('Origin', process.env.WEB_ORIGIN!)
        .set('Cookie', student.session)
        .send(body);
    const bank = (body: object, headers: Record<string, string> = {}) =>
      t
        .http()
        .post('/payments/webhook/vietqr')
        .set({ 'x-api-key': bankKey, ...headers })
        .send(body);
    const transfer = (code: string, amount: number) => ({
      transactionId: `FT-${uid()}`,
      amount,
      transferContent: `CK ${code.replaceAll('-', '')}`,
    });
    const rows = (orderId: string) =>
      t.db.query(
        `SELECT provider, provider_transaction_id AS "txId", status, amount::int AS amount, currency, transfer_content AS memo, raw_payload AS "raw"
         FROM payment_transactions WHERE order_id=$1 ORDER BY created_at, id`,
        [orderId],
      );
    const orderStatus = async (orderId: string) =>
      (await t.db.query('SELECT status FROM orders WHERE id=$1', [orderId]))[0]
        .status as string;
    const enrolled = async (student: Account, courseId: string) =>
      (
        await t.db.query(
          'SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2',
          [student.id, courseId],
        )
      ).length === 1;

    // Stripe fakes
    const stripeSession = (id = `cs_test_${uid()}`) => ({
      id,
      url: `https://checkout.stripe.test/c/pay/${id}`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    });
    const stripeCheckout = async (student: Account, orderId: string) => {
      const session = stripeSession();
      stripeHttp = () => Promise.resolve(json(session));
      const response = await checkout(student, orderId, {
        provider: 'STRIPE',
      }).expect(201);
      return { body: response.body, session };
    };
    const stripeEvent = (
      type: string,
      fact: { id: string; code: string; amount: number; currency?: string },
      overrides: Record<string, unknown> = {},
    ) => ({
      id: `evt_${uid()}`,
      type,
      data: {
        object: {
          id: fact.id,
          client_reference_id: fact.code,
          amount_total: fact.amount,
          currency: fact.currency ?? 'vnd',
          payment_status: 'paid',
          status: 'complete',
          ...overrides,
        },
      },
    });
    const stripeWebhook = (
      event: object,
      options: { secret?: string; at?: number; raw?: string } = {},
    ) => {
      const raw = options.raw ?? JSON.stringify(event);
      return t
        .http()
        .post('/payments/webhook/stripe')
        .set('content-type', 'application/json')
        .set(
          'stripe-signature',
          signStripePayload(
            raw,
            options.secret ?? STRIPE_WEBHOOK_SECRET,
            options.at ?? Math.floor(Date.now() / 1000),
          ),
        )
        .send(raw);
    };

    // ------------------------------------------------------------- checkout
    describe('CheckoutService.initiateCheckout', () => {
      it('starts a VietQR payment: INITIATED ledger row, provider recorded, idempotent', async () => {
        const courseId = await paidCourse(250000);
        const student = await t.account();
        const created = await order(student, [courseId]);

        const first = (
          await checkout(student, created.orderId, {
            provider: 'VIETQR',
          }).expect(201)
        ).body;
        expect(first).toMatchObject({
          orderId: created.orderId,
          orderCode: created.code,
          provider: 'VIETQR',
          providerTransactionId: `VIETQR-${created.code}`,
          amount: 250000,
          currency: 'VND',
        });
        const qr = new URL(first.qrCodeUrl);
        expect(qr.searchParams.get('amount')).toBe('250000');
        expect(qr.searchParams.get('addInfo')).toBe(
          created.code.replaceAll('-', ''),
        );
        expect(first.paymentUrl).toBeUndefined();

        const again = (
          await checkout(student, created.orderId, {
            provider: 'VIETQR',
          }).expect(201)
        ).body;
        expect(again.providerTransactionId).toBe(first.providerTransactionId);
        const ledger = await rows(created.orderId);
        expect(ledger).toHaveLength(1);
        expect(ledger[0]).toMatchObject({
          provider: 'VIETQR',
          status: 'INITIATED',
          amount: 250000,
          currency: 'VND',
        });
        expect(
          (
            await t.db.query(
              'SELECT payment_provider p FROM orders WHERE id=$1',
              [created.orderId],
            )
          )[0].p,
        ).toBe('VIETQR');
      });

      it('settles the INITIATED row in place when the bank notification arrives', async () => {
        const courseId = await paidCourse(250000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        await checkout(student, created.orderId, { provider: 'VIETQR' }).expect(
          201,
        );

        const payment = transfer(created.code, 250000);
        await bank(payment).expect(200).expect({ status: 'COMPLETED' });

        const ledger = await rows(created.orderId);
        expect(ledger).toHaveLength(1);
        expect(ledger[0]).toMatchObject({
          status: 'SUCCESS',
          txId: payment.transactionId,
          amount: 250000,
          memo: payment.transferContent,
          raw: payment,
        });
        expect(await orderStatus(created.orderId)).toBe('COMPLETED');
        expect(await enrolled(student, courseId)).toBe(true);
        await bank(payment).expect(200).expect({ status: 'ALREADY_PROCESSED' });
        expect(await rows(created.orderId)).toHaveLength(1);
      });

      it('rejects what cannot be paid', async () => {
        const courseId = await paidCourse(100000);
        const usdCourse = await paidCourse(1999, 'USD');
        const student = await t.account();
        const stranger = await t.account();
        const base = await order(student, [courseId]);
        const usd = await order(student, [usdCourse]);
        expect(usd.currency).toBe('USD');

        // someone else's order is invisible
        await checkout(stranger, base.orderId, { provider: 'VIETQR' }).expect(
          404,
        );
        // currency the gateway cannot charge
        await checkout(student, usd.orderId, { provider: 'VIETQR' })
          .expect(400)
          .expect(({ body }) =>
            expect(body.message).toBe('PAYMENT_CURRENCY_NOT_SUPPORTED'),
          );
        // validation and availability
        await checkout(student, base.orderId, { provider: 'PAYPAL' }).expect(
          400,
        );
        await checkout(student, base.orderId, {}).expect(400);
        await checkout(student, base.orderId, { provider: 'MOMO' }).expect(404);
        await checkout(student, base.orderId, {
          provider: 'VIETQR',
          extra: 1,
        }).expect(400);
        // open-redirect protection
        await checkout(student, base.orderId, {
          provider: 'STRIPE',
          returnUrl: 'https://evil.example/steal',
        })
          .expect(400)
          .expect(({ body }) =>
            expect(body.message).toBe('INVALID_REDIRECT_URL'),
          );
        await checkout(student, base.orderId, {
          provider: 'STRIPE',
          returnUrl: 'not a url',
        }).expect(400);
        // unconfigured gateway fails closed
        const account = process.env.VIETQR_ACCOUNT_NO;
        delete process.env.VIETQR_ACCOUNT_NO;
        await checkout(student, base.orderId, { provider: 'VIETQR' }).expect(
          503,
        );
        process.env.VIETQR_ACCOUNT_NO = account;

        // order state
        await t.db.query(
          `UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id=$1`,
          [base.orderId],
        );
        await checkout(student, base.orderId, { provider: 'VIETQR' })
          .expect(409)
          .expect(({ body }) => expect(body.message).toBe('ORDER_EXPIRED'));
        await t.db.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1`, [
          base.orderId,
        ]);
        await checkout(student, base.orderId, { provider: 'VIETQR' })
          .expect(409)
          .expect(({ body }) => expect(body.message).toBe('ORDER_NOT_PAYABLE'));
        expect(await rows(base.orderId)).toHaveLength(0);
      });

      it('starts a Stripe Checkout Session from the frozen order and keeps the order payable for its window', async () => {
        const courseId = await paidCourse(499000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        await t.send('patch', `/courses/${courseId}/pricing`, owner.session, {
          accessType: 'PAID',
          price: 999000,
        });
        stripeCalls.length = 0;

        const { body, session } = await stripeCheckout(
          student,
          created.orderId,
        );

        expect(body).toMatchObject({
          provider: 'STRIPE',
          providerTransactionId: session.id,
          paymentUrl: session.url,
          amount: 499000,
          currency: 'VND',
        });
        expect(body.qrCodeUrl).toBeUndefined();
        const [call] = stripeCalls;
        expect(call!.url).toBe('https://api.stripe.com/v1/checkout/sessions');
        expect(Object.fromEntries(call!.form!)).toMatchObject({
          client_reference_id: created.code,
          'line_items[0][price_data][unit_amount]': '499000',
          'line_items[0][price_data][currency]': 'vnd',
          'metadata[order_id]': created.orderId,
          success_url: `http://localhost:3000/orders/${created.orderId}?checkout=success`,
        });
        expect(
          call!.form!.get('line_items[0][price_data][product_data][name]'),
        ).toContain('Edge cases');
        // the 15-minute order is extended to cover Stripe's 30+ minute session
        const [{ ms }] = await t.db.query(
          `SELECT extract(epoch FROM (expires_at - created_at))*1000 AS ms FROM orders WHERE id=$1`,
          [created.orderId],
        );
        expect(Number(ms)).toBeGreaterThan(30 * 60_000);
        expect((await rows(created.orderId))[0]).toMatchObject({
          provider: 'STRIPE',
          txId: session.id,
          status: 'INITIATED',
          amount: 499000,
        });
      });

      it('lets the buyer switch gateway while the order is PENDING', async () => {
        const courseId = await paidCourse(100000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        await checkout(student, created.orderId, { provider: 'VIETQR' }).expect(
          201,
        );
        const { session } = await stripeCheckout(student, created.orderId);
        expect(
          (await rows(created.orderId)).map(
            (r: { provider: string }) => r.provider,
          ),
        ).toEqual(['VIETQR', 'STRIPE']);

        // Paying through the second gateway completes the order and leaves the
        // abandoned VietQR attempt as it was.
        await stripeWebhook(
          stripeEvent('checkout.session.completed', {
            id: session.id,
            code: created.code,
            amount: 100000,
          }),
        )
          .expect(200)
          .expect({ status: 'COMPLETED' });
        const ledger = await rows(created.orderId);
        expect(
          ledger.map((r: { provider: string; status: string }) => [
            r.provider,
            r.status,
          ]),
        ).toEqual([
          ['VIETQR', 'INITIATED'],
          ['STRIPE', 'SUCCESS'],
        ]);
      });
    });

    // -------------------------------------------------- strict verification
    describe('webhook verification', () => {
      it('rejects unauthenticated bank notifications with no side effects', async () => {
        const courseId = await paidCourse(100000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        await checkout(student, created.orderId, { provider: 'VIETQR' }).expect(
          201,
        );
        const payment = transfer(created.code, 100000);
        const before = await rows(created.orderId);

        await bank(payment, { 'x-api-key': 'wrong' }).expect(401);
        await t
          .http()
          .post('/payments/webhook/vietqr')
          .send(payment)
          .expect(401);
        await t
          .http()
          .post('/payments/webhook/vietqr')
          .set('authorization', 'Apikey nope')
          .send(payment)
          .expect(401);

        expect(await rows(created.orderId)).toEqual(before);
        expect(await orderStatus(created.orderId)).toBe('PENDING');
        expect(await enrolled(student, courseId)).toBe(false);
      });

      it('accepts Authorization: Apikey and the SePay payload shape', async () => {
        const courseId = await paidCourse(100000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        await t
          .http()
          .post('/payments/webhook/vietqr')
          .set('authorization', `Apikey ${bankKey}`)
          .send({
            id: 92704,
            referenceCode: `FT${uid()}`,
            transferType: 'in',
            transferAmount: 100000,
            content: `chuyen tien ${created.code.replaceAll('-', '').toLowerCase()}`,
          })
          .expect(200)
          .expect({ status: 'COMPLETED' });
        expect(await enrolled(student, courseId)).toBe(true);
        // debits never settle anything
        await bank({
          id: 1,
          referenceCode: `FT${uid()}`,
          transferType: 'out',
          transferAmount: 5,
          content: created.code,
        })
          .expect(200)
          .expect({ status: 'ACKNOWLEDGED' });
      });

      it('enforces the optional body HMAC', async () => {
        process.env.BANK_WEBHOOK_HMAC_SECRET = 'hmac-spec-secret';
        try {
          const courseId = await paidCourse(100000);
          const student = await t.account();
          const created = await order(student, [courseId]);
          const raw = JSON.stringify(transfer(created.code, 100000));
          const post = (signature?: string) =>
            t
              .http()
              .post('/payments/webhook/vietqr')
              .set('content-type', 'application/json')
              .set('x-api-key', bankKey)
              .set(signature ? { 'x-signature': signature } : {})
              .send(raw);

          await post().expect(401);
          await post('0'.repeat(64)).expect(401);
          await post(hmacSha256Hex('other-secret', raw)).expect(401);
          expect(await orderStatus(created.orderId)).toBe('PENDING');
          await post(hmacSha256Hex('hmac-spec-secret', raw))
            .expect(200)
            .expect({ status: 'COMPLETED' });
        } finally {
          delete process.env.BANK_WEBHOOK_HMAC_SECRET;
        }
      });

      it('rejects forged, replayed, unsigned and wrongly keyed Stripe events untouched', async () => {
        const courseId = await paidCourse(100000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        const { session } = await stripeCheckout(student, created.orderId);
        const event = stripeEvent('checkout.session.completed', {
          id: session.id,
          code: created.code,
          amount: 100000,
        });
        const before = await rows(created.orderId);

        await stripeWebhook(event, { secret: 'whsec_attacker' }).expect(401);
        await stripeWebhook(event, {
          at: Math.floor(Date.now() / 1000) - 3600,
        }).expect(401);
        await t
          .http()
          .post('/payments/webhook/stripe')
          .set('content-type', 'application/json')
          .send(JSON.stringify(event))
          .expect(401);
        // signed one body, delivered another
        const signedFor = JSON.stringify({ ...event, id: 'evt_other' });
        await t
          .http()
          .post('/payments/webhook/stripe')
          .set('content-type', 'application/json')
          .set(
            'stripe-signature',
            signStripePayload(
              signedFor,
              STRIPE_WEBHOOK_SECRET,
              Math.floor(Date.now() / 1000),
            ),
          )
          .send(JSON.stringify(event))
          .expect(401);
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        delete process.env.STRIPE_WEBHOOK_SECRET;
        await stripeWebhook(event).expect(401);
        process.env.STRIPE_WEBHOOK_SECRET = secret;

        expect(await rows(created.orderId)).toEqual(before);
        expect(await orderStatus(created.orderId)).toBe('PENDING');
        expect(await enrolled(student, courseId)).toBe(false);
      });

      it('404s unknown and unregistered providers', async () => {
        await t.http().post('/payments/webhook/paypal').send({}).expect(404);
        await t.http().post('/payments/webhook/momo').send({}).expect(404);
      });
    });

    // ------------------------------------------------------- stripe outcomes
    describe('Stripe settlement', () => {
      async function pending(price = 499000) {
        const courseId = await paidCourse(price);
        const student = await t.account();
        const created = await order(student, [courseId]);
        const { session } = await stripeCheckout(student, created.orderId);
        return { courseId, student, created, session };
      }

      it('completes the order, updates the ledger row and enrolls — once', async () => {
        const { courseId, student, created, session } = await pending();
        const event = stripeEvent('checkout.session.completed', {
          id: session.id,
          code: created.code,
          amount: 499000,
        });

        await stripeWebhook(event).expect(200).expect({ status: 'COMPLETED' });
        const ledger = await rows(created.orderId);
        expect(ledger).toHaveLength(1);
        expect(ledger[0]).toMatchObject({
          provider: 'STRIPE',
          txId: session.id,
          status: 'SUCCESS',
          amount: 499000,
          currency: 'VND',
        });
        expect(ledger[0].raw).toMatchObject({
          type: 'checkout.session.completed',
        });
        expect(await orderStatus(created.orderId)).toBe('COMPLETED');
        expect(await enrolled(student, courseId)).toBe(true);

        // Stripe retries are harmless, also concurrent ones
        const retries = await Promise.all(
          Array.from({ length: 4 }, () => stripeWebhook(event)),
        );
        expect(retries.map((r) => r.body.status)).toEqual(
          Array(4).fill('ALREADY_PROCESSED'),
        );
        expect(await rows(created.orderId)).toHaveLength(1);
      });

      it('settles in USD cents', async () => {
        const courseId = await paidCourse(1999, 'USD');
        const student = await t.account();
        const created = await order(student, [courseId]);
        stripeCalls.length = 0;
        const { session } = await stripeCheckout(student, created.orderId);
        expect(
          stripeCalls[0]!.form!.get('line_items[0][price_data][unit_amount]'),
        ).toBe('1999');
        expect(
          stripeCalls[0]!.form!.get('line_items[0][price_data][currency]'),
        ).toBe('usd');
        await stripeWebhook(
          stripeEvent('checkout.session.completed', {
            id: session.id,
            code: created.code,
            amount: 1999,
            currency: 'usd',
          }),
        )
          .expect(200)
          .expect({ status: 'COMPLETED' });
        expect(await enrolled(student, courseId)).toBe(true);
      });

      it('does not complete underpaid or wrong-currency payments', async () => {
        const under = await pending();
        await stripeWebhook(
          stripeEvent('checkout.session.completed', {
            id: under.session.id,
            code: under.created.code,
            amount: 100,
          }),
        )
          .expect(200)
          .expect({ status: 'PARTIAL_AMOUNT' });
        expect(await orderStatus(under.created.orderId)).toBe('PENDING');
        expect(await enrolled(under.student, under.courseId)).toBe(false);

        const wrong = await pending();
        await stripeWebhook(
          stripeEvent('checkout.session.completed', {
            id: wrong.session.id,
            code: wrong.created.code,
            amount: 499000,
            currency: 'usd',
          }),
        )
          .expect(200)
          .expect({ status: 'CURRENCY_MISMATCH' });
        expect(await orderStatus(wrong.created.orderId)).toBe('PENDING');
        expect((await rows(wrong.created.orderId))[0].status).toBe('FAILED');
      });

      it('records failed, expired and delayed-payment outcomes without closing the order', async () => {
        const delayed = await pending();
        await stripeWebhook(
          stripeEvent(
            'checkout.session.completed',
            {
              id: delayed.session.id,
              code: delayed.created.code,
              amount: 499000,
            },
            { payment_status: 'unpaid' },
          ),
        )
          .expect(200)
          .expect({ status: 'ACKNOWLEDGED' });
        expect((await rows(delayed.created.orderId))[0].status).toBe(
          'INITIATED',
        );
        // the bank debit later clears
        await stripeWebhook(
          stripeEvent('checkout.session.async_payment_succeeded', {
            id: delayed.session.id,
            code: delayed.created.code,
            amount: 499000,
          }),
        )
          .expect(200)
          .expect({ status: 'COMPLETED' });
        expect(await enrolled(delayed.student, delayed.courseId)).toBe(true);

        for (const type of [
          'checkout.session.async_payment_failed',
          'checkout.session.expired',
        ]) {
          const attempt = await pending();
          await stripeWebhook(
            stripeEvent(
              type,
              {
                id: attempt.session.id,
                code: attempt.created.code,
                amount: 499000,
              },
              { payment_status: 'unpaid' },
            ),
          )
            .expect(200)
            .expect({ status: 'PAYMENT_FAILED' });
          expect((await rows(attempt.created.orderId))[0].status).toBe(
            'FAILED',
          );
          expect(await orderStatus(attempt.created.orderId)).toBe('PENDING');
          expect(await enrolled(attempt.student, attempt.courseId)).toBe(false);
        }
      });

      it('acknowledges events it does not act on', async () => {
        await stripeWebhook({
          id: `evt_${uid()}`,
          type: 'customer.created',
          data: { object: { id: 'cus_1' } },
        })
          .expect(200)
          .expect({ status: 'ACKNOWLEDGED' });
      });

      it('books a late payment on a finished order as evidence, grants nothing extra', async () => {
        const { student, created, session, courseId } = await pending();
        await stripeWebhook(
          stripeEvent('checkout.session.completed', {
            id: session.id,
            code: created.code,
            amount: 499000,
          }),
        ).expect(200);
        // customer opens a second session and pays again
        const second = stripeSession();
        stripeHttp = () => Promise.resolve(json(second));
        await checkout(student, created.orderId, { provider: 'STRIPE' }).expect(
          409,
        );
        await stripeWebhook(
          stripeEvent('checkout.session.completed', {
            id: second.id,
            code: created.code,
            amount: 499000,
          }),
        )
          .expect(200)
          .expect({ status: 'IGNORED' });
        const ledger = await rows(created.orderId);
        expect(ledger.map((r: { status: string }) => r.status)).toEqual([
          'SUCCESS',
          'FAILED',
        ]);
        expect(ledger[1].raw).toMatchObject({
          type: 'checkout.session.completed',
        });
        expect(await enrolled(student, courseId)).toBe(true);
      });
    });

    // ------------------------------------------------------------- events
    describe('OrderCompletedEvent and EnrollmentListener', () => {
      const capture = (orderId: string) => {
        const seen: Array<{
          event: OrderCompletedEvent;
          statusAtDelivery: string;
        }> = [];
        const off = t.app
          .get(PaymentEventBus)
          .subscribe(OrderCompletedEvent, async (event) => {
            if (event.orderId === orderId)
              seen.push({
                event,
                statusAtDelivery: await orderStatus(event.orderId),
              });
          });
        return { seen, off };
      };

      it('publishes after commit with every course of the order and enrolls them all', async () => {
        const a = await paidCourse(100000);
        const b = await paidCourse(200000);
        const student = await t.account();
        const created = await order(student, [b, a]);
        const { seen, off } = capture(created.orderId);
        try {
          await bank(transfer(created.code, 300000))
            .expect(200)
            .expect({ status: 'COMPLETED' });
        } finally {
          off();
        }
        expect(seen).toHaveLength(1);
        expect(seen[0]!.statusAtDelivery).toBe('COMPLETED'); // durable when delivered
        expect(seen[0]!.event).toMatchObject({
          orderId: created.orderId,
          orderCode: created.code,
          userId: student.id,
        });
        expect(seen[0]!.event.courseIds).toEqual([b, a]); // as ordered by the buyer
        expect(await enrolled(student, a)).toBe(true);
        expect(await enrolled(student, b)).toBe(true);
      });

      it('publishes nothing for payments that do not complete an order, then once for the full payment', async () => {
        const courseId = await paidCourse(100000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        const { seen, off } = capture(created.orderId);
        try {
          await bank(transfer(created.code, 5))
            .expect(200)
            .expect({ status: 'PARTIAL_AMOUNT' });
          expect(seen).toEqual([]);
          expect(await enrolled(student, courseId)).toBe(false);
          // the short transfer did not freeze the order
          await bank(transfer(created.code, 100000))
            .expect(200)
            .expect({ status: 'COMPLETED' });
          // money for a finished order is evidence only
          await bank(transfer(created.code, 100000))
            .expect(200)
            .expect({ status: 'IGNORED' });
        } finally {
          off();
        }
        expect(seen).toHaveLength(1);
        expect(await enrolled(student, courseId)).toBe(true);
      });

      it('survives a failing subscriber: payment is acknowledged and enrollment still happens', async () => {
        const courseId = await paidCourse(100000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        const off = t.app
          .get(PaymentEventBus)
          .subscribe(OrderCompletedEvent, (event) => {
            if (event.orderId === created.orderId)
              throw new Error('receipt mailer down');
          });
        try {
          await bank(transfer(created.code, 100000))
            .expect(200)
            .expect({ status: 'COMPLETED' });
        } finally {
          off();
        }
        expect(await enrolled(student, courseId)).toBe(true);
      });

      it('re-delivers fulfilment for a paid order whose enrollment is missing', async () => {
        const courseId = await paidCourse(100000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        await bank(transfer(created.code, 100000)).expect(200);
        // listener crashed / process died after COMMIT
        await t.db.query(
          'DELETE FROM enrollments WHERE user_id=$1 AND course_id=$2',
          [student.id, courseId],
        );
        await t.db.query(
          `UPDATE orders SET updated_at = now() - interval '5 minutes' WHERE id=$1`,
          [created.orderId],
        );
        expect(await enrolled(student, courseId)).toBe(false);

        const reconciliation = t.app.get(PaymentReconciliationService);
        expect(
          await reconciliation.republishUnfulfilledOrders(60),
        ).toBeGreaterThanOrEqual(1);
        expect(await enrolled(student, courseId)).toBe(true);
        // nothing left to heal for this order
        const healed = await t.db.query(
          `SELECT 1 FROM orders o JOIN order_items i ON i.order_id=o.id
          WHERE o.id=$1 AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id=o.user_id AND e.course_id=i.course_id)`,
          [created.orderId],
        );
        expect(healed).toHaveLength(0);
      });

      it('EnrollmentService.grantEnrollment is idempotent under concurrency', async () => {
        const courseId = (await t.course(owner, 1)).id;
        const student = await t.account();
        const { EnrollmentService } =
          await import('../../../src/courses/enrollment.service.js');
        const service = t.app.get(EnrollmentService);
        const results = await Promise.all(
          Array.from({ length: 6 }, () =>
            service.grantEnrollment(student.id, courseId),
          ),
        );
        expect(results.filter((r) => r.granted)).toHaveLength(1);
        expect(
          (
            await t.db.query(
              'SELECT count(*)::int n FROM enrollments WHERE user_id=$1 AND course_id=$2',
              [student.id, courseId],
            )
          )[0].n,
        ).toBe(1);
      });
    });

    // ------------------------------------------------------ reconciliation
    describe('lost-webhook reconciliation (queryPayment)', () => {
      it('settles a paid Stripe session whose webhook never arrived', async () => {
        const courseId = await paidCourse(499000);
        const student = await t.account();
        const created = await order(student, [courseId]);
        const { session } = await stripeCheckout(student, created.orderId);

        // Stripe says: paid. (Only this session is known to the fake.)
        stripeHttp = (url) =>
          Promise.resolve(
            url.endsWith(`/${session.id}`)
              ? json({
                  id: session.id,
                  client_reference_id: created.code,
                  amount_total: 499000,
                  currency: 'vnd',
                  payment_status: 'paid',
                  status: 'complete',
                })
              : json({ error: {} }, 404),
          );
        const settled = await t.app
          .get(PaymentReconciliationService)
          .reconcilePendingCheckouts(0);

        expect(settled).toBeGreaterThanOrEqual(1);
        expect(await orderStatus(created.orderId)).toBe('COMPLETED');
        expect((await rows(created.orderId))[0]).toMatchObject({
          status: 'SUCCESS',
          txId: session.id,
          amount: 499000,
        });
        expect(await enrolled(student, courseId)).toBe(true);
      });

      it('leaves open sessions alone and records expired ones', async () => {
        const openUser = await t.account();
        const expiredUser = await t.account();
        const open = await order(openUser, [await paidCourse(100000)]);
        const expired = await order(expiredUser, [await paidCourse(100000)]);
        const known = new Map<string, object>();
        for (const [user, created, state] of [
          [openUser, open, 'open'],
          [expiredUser, expired, 'expired'],
        ] as const) {
          const session = stripeSession();
          stripeHttp = () => Promise.resolve(json(session));
          await checkout(user, created.orderId, { provider: 'STRIPE' }).expect(
            201,
          );
          known.set(session.id, {
            id: session.id,
            client_reference_id: created.code,
            amount_total: 100000,
            currency: 'vnd',
            payment_status: 'unpaid',
            status: state,
          });
        }
        stripeHttp = (url) => {
          const found = [...known].find(([id]) => url.endsWith(`/${id}`));
          return Promise.resolve(
            found ? json(found[1]) : json({ error: {} }, 404),
          );
        };
        await t.app
          .get(PaymentReconciliationService)
          .reconcilePendingCheckouts(0);

        expect((await rows(open.orderId))[0].status).toBe('INITIATED');
        expect((await rows(expired.orderId))[0].status).toBe('FAILED');
        // the order stays payable through another gateway
        expect(await orderStatus(open.orderId)).toBe('PENDING');
        expect(await orderStatus(expired.orderId)).toBe('PENDING');
      });
    });

    // ------------------------------------------------------- architecture
    describe('provider abstraction', () => {
      it('keeps the core domain free of any concrete gateway', () => {
        const core = [
          'checkout.service.ts',
          'payment-webhook.service.ts',
          'payment-reconciliation.service.ts',
          'payment-transaction.service.ts',
          'payment-provider.factory.ts',
          'payment.service.ts',
          'payment.controller.ts',
          'webhook.controller.ts',
          'order-factory.service.ts',
          'order-query.service.ts',
          'order-view.ts',
          'events/order-completed.event.ts',
          'events/payment-event-bus.ts',
          '../../courses/enrollment.service.ts',
          '../../courses/enrollment.listener.ts',
        ];
        for (const file of core) {
          const source = readFileSync(
            new URL(`../../../src/modules/payment/${file}`, import.meta.url),
            'utf8',
          )
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
          expect(source, file).not.toMatch(/providers\//);
          expect(source, file).not.toMatch(
            /\b(stripe|vietqr|momo|vnpay|sepay)\b/i,
          );
        }
      });
    });
  },
);

// ------------------------------------------------------------ plug and play
describe(
  'PAY6-9 plug and play: a third gateway without touching core code',
  { timeout: 30_000 },
  () => {
    let t: Awaited<ReturnType<typeof learningApp>>;

    beforeAll(async () => {
      Object.assign(process.env, {
        BANK_WEBHOOK_API_KEY: 'x'.repeat(32),
        VIETQR_BANK_ID: '970422',
        VIETQR_ACCOUNT_NO: '123456789',
      });
      t = await learningApp('plug-and-play', (builder) =>
        builder.overrideProvider(PAYMENT_PROVIDERS).useFactory({
          factory: (
            vietqr: VietQRProviderAdapter,
            stripe: StripeProviderAdapter,
          ) => [vietqr, stripe, new FakeMomoProvider()],
          inject: [VietQRProviderAdapter, StripeProviderAdapter],
        }),
      );
    });
    afterAll(async () => {
      await t?.app.close();
    });

    it('runs checkout, verified webhook, completion and enrollment through MoMo', async () => {
      const owner = await t.account('instructor');
      const student = await t.account();
      const course = await t.course(owner, 1);
      await t
        .send('patch', `/courses/${course.id}/pricing`, owner.session, {
          accessType: 'PAID',
          price: 123000,
        })
        .expect(200);
      const created = (
        await t
          .http()
          .post('/orders')
          .set('Origin', process.env.WEB_ORIGIN!)
          .set('Cookie', student.session)
          .send({ courseIds: [course.id] })
          .expect(201)
      ).body;

      const started = (
        await t
          .http()
          .post(`/orders/${created.orderId}/checkout`)
          .set('Origin', process.env.WEB_ORIGIN!)
          .set('Cookie', student.session)
          .send({ provider: 'MOMO' })
          .expect(201)
      ).body;
      expect(started).toMatchObject({
        provider: 'MOMO',
        paymentUrl: 'https://momo.test/pay?amount=123000',
      });

      const notify = (headers: Record<string, string>) =>
        t
          .http()
          .post('/payments/webhook/momo')
          .set(headers)
          .send({ order: created.code, trx: `MM-${uid()}`, amount: 123000 });
      await notify({ 'x-momo-secret': 'forged' }).expect(401);
      expect(
        (
          await t.db.query('SELECT 1 FROM enrollments WHERE user_id=$1', [
            student.id,
          ])
        ).length,
      ).toBe(0);
      await notify({ 'x-momo-secret': 'momo-secret' })
        .expect(200)
        .expect({ status: 'COMPLETED' });
      expect(
        (
          await t.db.query(
            'SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2',
            [student.id, course.id],
          )
        ).length,
      ).toBe(1);
      expect(
        (
          await t.db.query(
            `SELECT provider, status FROM payment_transactions WHERE order_id=$1`,
            [created.orderId],
          )
        )[0],
      ).toEqual({ provider: 'MOMO', status: 'SUCCESS' });
    });
  },
);
