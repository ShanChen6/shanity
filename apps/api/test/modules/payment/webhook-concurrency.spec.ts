import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { OrderCompletedEvent } from '../../../src/modules/payment/events/order-completed.event.js';
import { PaymentEventBus } from '../../../src/modules/payment/events/payment-event-bus.js';
import { PaymentProviderEnum } from '../../../src/modules/payment/interfaces/index.js';
import { OrderFactoryService } from '../../../src/modules/payment/order-factory.service.js';
import { PaymentSettlementService } from '../../../src/modules/payment/payment-settlement.service.js';
import { signStripePayload } from '../../../src/modules/payment/providers/stripe/stripe-signature.js';
import { WebhookProcessorService } from '../../../src/modules/payment/webhook-processor.service.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

const STRIPE_SECRET = 'whsec_webhook_concurrency';
const uid = () => randomUUID().replaceAll('-', '').slice(0, 10);

/**
 * PAY10-13: whatever the gateway does - redelivers, races itself, sends the
 * notification hours late - the outcome is one COMPLETED order, one SUCCESS
 * ledger row and one enrollment, and every delivery is acknowledged.
 */
describe(
  'PAY10-13 webhook engine under concurrency',
  { timeout: 90_000 },
  () => {
    let t: Awaited<ReturnType<typeof learningApp>>;
    let owner: Account;
    let factory: OrderFactoryService;
    let processor: WebhookProcessorService;
    let bus: PaymentEventBus;
    const bankKey = `bank-${uid()}${uid()}${uid()}`;
    const headers = { 'x-api-key': bankKey };

    beforeAll(async () => {
      Object.assign(process.env, {
        BANK_WEBHOOK_API_KEY: bankKey,
        VIETQR_BANK_ID: '970422',
        VIETQR_ACCOUNT_NO: '123456789',
        STRIPE_SECRET_KEY: 'sk_test_x',
        STRIPE_WEBHOOK_SECRET: STRIPE_SECRET,
      });
      t = await learningApp('webhook-concurrency');
      owner = await t.account('instructor');
      factory = t.app.get(OrderFactoryService);
      processor = t.app.get(WebhookProcessorService);
      bus = t.app.get(PaymentEventBus);
    });
    afterAll(async () => {
      await t?.app.close();
      for (const key of [
        'BANK_WEBHOOK_API_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
      ])
        delete process.env[key];
    });

    // -------------------------------------------------------------- helpers
    async function purchase(price = 499000) {
      const course = await t.course(owner, 1);
      await t
        .send('patch', `/courses/${course.id}/pricing`, owner.session, {
          accessType: 'PAID',
          price,
        })
        .expect(200);
      const student = await t.account();
      const order = await factory.createOrder(student.id, {
        courseIds: [course.id],
      });
      return { courseId: course.id, student, order };
    }
    const memo = (code: string) => `CK ${code.replaceAll('-', '')}`;
    const nativePayload = (
      code: string,
      amount: number,
      id = `FT-${uid()}`,
    ) => ({
      transactionId: id,
      amount,
      transferContent: memo(code),
    });
    const count = async (sql: string, params: unknown[] = []) =>
      (await t.db.query(`SELECT count(*)::int AS n FROM ${sql}`, params))[0]
        .n as number;
    const orderStatus = async (orderId: string) =>
      (await t.db.query('SELECT status FROM orders WHERE id=$1', [orderId]))[0]
        .status as string;
    const tally = (outcomes: string[]) =>
      outcomes.reduce<Record<string, number>>(
        (acc, status) => ({ ...acc, [status]: (acc[status] ?? 0) + 1 }),
        {},
      );
    const deliveries = (provider: string, txId: string) =>
      t.db.query(
        `SELECT status, outcome FROM webhook_logs WHERE provider=$1 AND (provider_transaction_id=$2 OR payload->>'transactionId'=$2) ORDER BY created_at`,
        [provider, txId],
      );
    const captureCompleted = (orderId: string) => {
      const events: OrderCompletedEvent[] = [];
      const off = bus.subscribe(OrderCompletedEvent, (e) => {
        if (e.orderId === orderId) events.push(e);
      });
      return { events, off };
    };
    const httpBank = (body: object, path = 'payments/webhook/vietqr') =>
      t.http().post(`/${path}`).set(headers).send(body);
    const stripeWebhook = (event: object) => {
      const raw = JSON.stringify(event);
      return t
        .http()
        .post('/payments/webhook/stripe')
        .set('content-type', 'application/json')
        .set(
          'stripe-signature',
          signStripePayload(raw, STRIPE_SECRET, Math.floor(Date.now() / 1000)),
        )
        .send(raw);
    };

    // ---------------------------------------------------------- idempotency
    describe('strict idempotency', () => {
      it('5 simultaneous deliveries -> 1 completion, 4 no-op acknowledgements (service level)', async () => {
        const { courseId, student, order } = await purchase();
        const payload = nativePayload(order.code, 499000);
        const { events, off } = captureCompleted(order.orderId);

        const results = await Promise.all(
          Array.from({ length: 5 }, () =>
            processor.handleWebhook(
              PaymentProviderEnum.VIETQR,
              payload,
              headers,
            ),
          ),
        );
        off();

        expect(tally(results.map((r) => r.status))).toEqual({
          COMPLETED: 1,
          ALREADY_PROCESSED: 4,
        });
        expect(await orderStatus(order.orderId)).toBe('COMPLETED');
        expect(
          await count('payment_transactions WHERE order_id=$1', [
            order.orderId,
          ]),
        ).toBe(1);
        expect(
          await count(
            `payment_transactions WHERE order_id=$1 AND status='SUCCESS'`,
            [order.orderId],
          ),
        ).toBe(1);
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(1);
        expect(events).toHaveLength(1); // fulfilment ran exactly once

        // every delivery is audited: one PROCESSED, the rest DUPLICATE
        const logs = await deliveries('VIETQR', payload.transactionId);
        expect(tally(logs.map((l: { status: string }) => l.status))).toEqual({
          PROCESSED: 1,
          DUPLICATE: 4,
        });
        expect(
          logs.find((l: { status: string }) => l.status === 'PROCESSED')
            .outcome,
        ).toBe('COMPLETED');
      });

      it('100 simultaneous HTTP deliveries (both routes) -> all 200, nothing duplicated', async () => {
        const { courseId, student, order } = await purchase();
        const payload = nativePayload(order.code, 499000);
        const { events, off } = captureCompleted(order.orderId);

        const responses = await Promise.all(
          Array.from({ length: 100 }, (_, i) =>
            httpBank(
              payload,
              i % 2
                ? 'api/v1/payments/webhook/vietqr'
                : 'payments/webhook/vietqr',
            ),
          ),
        );
        off();

        expect(responses.map((r) => r.status)).toEqual(Array(100).fill(200));
        expect(tally(responses.map((r) => r.body.status as string))).toEqual({
          COMPLETED: 1,
          ALREADY_PROCESSED: 99,
        });
        expect(await orderStatus(order.orderId)).toBe('COMPLETED');
        expect(
          await count('payment_transactions WHERE order_id=$1', [
            order.orderId,
          ]),
        ).toBe(1);
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(1);
        expect(events).toHaveLength(1);
        const logs = await deliveries('VIETQR', payload.transactionId);
        expect(tally(logs.map((l: { status: string }) => l.status))).toEqual({
          PROCESSED: 1,
          DUPLICATE: 99,
        });
      });

      it('a replay long after completion is a pure no-op', async () => {
        const { order } = await purchase();
        const payload = nativePayload(order.code, 499000);
        await httpBank(payload).expect(200).expect({ status: 'COMPLETED' });
        const before = await t.db.query(
          'SELECT id, status, updated_at FROM payment_transactions WHERE order_id=$1',
          [order.orderId],
        );
        const orderBefore = await t.db.query(
          'SELECT status, updated_at FROM orders WHERE id=$1',
          [order.orderId],
        );
        await httpBank(payload)
          .expect(200)
          .expect({ status: 'ALREADY_PROCESSED' });
        expect(
          await t.db.query(
            'SELECT id, status, updated_at FROM payment_transactions WHERE order_id=$1',
            [order.orderId],
          ),
        ).toEqual(before);
        expect(
          await t.db.query(
            'SELECT status, updated_at FROM orders WHERE id=$1',
            [order.orderId],
          ),
        ).toEqual(orderBefore);
      });

      it('two different transfers racing for one order: one fulfils, the other is evidence only', async () => {
        const { courseId, student, order } = await purchase();
        const a = nativePayload(order.code, 499000);
        const b = nativePayload(order.code, 499000);
        const results = await Promise.all([
          processor.handleWebhook(PaymentProviderEnum.VIETQR, a, headers),
          processor.handleWebhook(PaymentProviderEnum.VIETQR, b, headers),
        ]);
        expect(tally(results.map((r) => r.status))).toEqual({
          COMPLETED: 1,
          IGNORED: 1,
        });
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(1);
        const ledger = await t.db.query(
          'SELECT status FROM payment_transactions WHERE order_id=$1',
          [order.orderId],
        );
        expect(ledger.map((r: { status: string }) => r.status).sort()).toEqual([
          'FAILED',
          'SUCCESS',
        ]);
      });

      it('the same Stripe event delivered 10x at once settles once; duplicate events are logged by event id', async () => {
        const { courseId, student, order } = await purchase();
        const session = `cs_test_${uid()}`;
        const event = {
          id: `evt_${uid()}`,
          type: 'checkout.session.completed',
          created: Math.floor(Date.now() / 1000),
          data: {
            object: {
              id: session,
              client_reference_id: order.code,
              amount_total: 499000,
              currency: 'vnd',
              payment_status: 'paid',
            },
          },
        };
        const responses = await Promise.all(
          Array.from({ length: 10 }, () => stripeWebhook(event)),
        );
        expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
        expect(tally(responses.map((r) => r.body.status as string))).toEqual({
          COMPLETED: 1,
          ALREADY_PROCESSED: 9,
        });
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(1);
        expect(
          await count(`webhook_logs WHERE event_id=$1 AND status='PROCESSED'`, [
            event.id,
          ]),
        ).toBe(1);
      });

      it('an unrelated Stripe event redelivered concurrently ends as PROCESSED + DUPLICATE via the unique index', async () => {
        const event = {
          id: `evt_${uid()}`,
          type: 'customer.created',
          data: { object: { id: 'cus_1' } },
        };
        const responses = await Promise.all(
          Array.from({ length: 6 }, () => stripeWebhook(event)),
        );
        expect(responses.map((r) => r.status)).toEqual(Array(6).fill(200));
        const logs = await t.db.query(
          'SELECT status FROM webhook_logs WHERE event_id=$1',
          [event.id],
        );
        expect(tally(logs.map((l: { status: string }) => l.status))).toEqual({
          PROCESSED: 1,
          DUPLICATE: 5,
        });
      });

      it('a PROCESSED row for the same transaction elsewhere turns this delivery into DUPLICATE, not a 500', async () => {
        const { order } = await purchase();
        const payload = nativePayload(order.code, 499000);
        // simulate the concurrent winner having already finalised its log
        await t.db.query(
          `INSERT INTO webhook_logs(provider, provider_transaction_id, payload, status, outcome)
         VALUES ('VIETQR', $1, '{}', 'PROCESSED', 'COMPLETED')`,
          [payload.transactionId],
        );
        const result = await processor.handleWebhook(
          PaymentProviderEnum.VIETQR,
          payload,
          headers,
        );
        expect(result.status).toBe('ALREADY_PROCESSED');
        const logs = await deliveries('VIETQR', payload.transactionId);
        expect(
          logs.filter((l: { status: string }) => l.status === 'DUPLICATE'),
        ).toHaveLength(1);
      });
    });

    // ------------------------------------------------------ authenticity
    describe('verification before anything is stored', () => {
      it('rejects forged deliveries with 401 and leaves no log, ledger or order change', async () => {
        const { courseId, student, order } = await purchase();
        const payload = nativePayload(order.code, 499000);
        const forged = await Promise.all(
          Array.from({ length: 5 }, () =>
            t
              .http()
              .post('/payments/webhook/vietqr')
              .set('x-api-key', 'nope')
              .send(payload),
          ),
        );
        expect(forged.map((r) => r.status)).toEqual(Array(5).fill(401));
        await stripeWebhook({ id: 'evt_x', type: 'customer.created' }).expect(
          200,
        );
        await t
          .http()
          .post('/payments/webhook/stripe')
          .set('stripe-signature', 't=1,v1=00')
          .send({ id: 'evt_forged' })
          .expect(401);

        expect(await deliveries('VIETQR', payload.transactionId)).toEqual([]);
        expect(
          await count('webhook_logs WHERE event_id=$1', ['evt_forged']),
        ).toBe(0);
        expect(
          await count('payment_transactions WHERE order_id=$1', [
            order.orderId,
          ]),
        ).toBe(0);
        expect(await orderStatus(order.orderId)).toBe('PENDING');
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(0);
      });
    });

    // ------------------------------------------------- off-page fulfilment
    describe('off-page / late fulfilment (no browser involved)', () => {
      // Vietnam wall-clock time as SePay writes it.
      const bankTime = (instant: Date) =>
        new Date(instant.getTime() + 7 * 3600_000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ');
      const sepay = (code: string, paidAt?: Date, amount = 499000) => ({
        id: Math.floor(Math.random() * 1e9),
        referenceCode: `FT${uid()}`,
        transferType: 'in',
        transferAmount: amount,
        content: memo(code),
        ...(paidAt && { transactionDate: bankTime(paidAt) }),
      });
      const expiresAt = async (orderId: string) =>
        (
          await t.db.query('SELECT expires_at FROM orders WHERE id=$1', [
            orderId,
          ])
        )[0].expires_at as Date;

      it('completes an order and grants access although the buyer never returns', async () => {
        const { courseId, student, order } = await purchase();
        // No session, cookie or status poll of the buyer anywhere in this test.
        await httpBank(nativePayload(order.code, 499000))
          .expect(200)
          .expect({ status: 'COMPLETED' });
        expect(await orderStatus(order.orderId)).toBe('COMPLETED');
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(1);
      });

      it('honours a payment made inside the window whose webhook arrives hours later', async () => {
        const { courseId, student, order } = await purchase();
        // 2 hours ago the window closed and the sweeper expired the order...
        await t.db.query(
          `UPDATE orders SET expires_at = now() - interval '2 hours' WHERE id=$1`,
          [order.orderId],
        );
        await t.db.query(`UPDATE orders SET status='EXPIRED' WHERE id=$1`, [
          order.orderId,
        ]);
        expect(await orderStatus(order.orderId)).toBe('EXPIRED');
        // ...but the bank says the transfer was made 5 minutes before it closed.
        const paidAt = new Date(
          (await expiresAt(order.orderId)).getTime() - 5 * 60_000,
        );

        await httpBank(sepay(order.code, paidAt))
          .set('authorization', `Apikey ${bankKey}`)
          .expect(200)
          .expect({ status: 'COMPLETED' });

        expect(await orderStatus(order.orderId)).toBe('COMPLETED');
        expect(
          await count(
            `payment_transactions WHERE order_id=$1 AND status='SUCCESS'`,
            [order.orderId],
          ),
        ).toBe(1);
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(1);
      });

      it('also fulfils a not-yet-swept order and a timestamp-less bank forward inside 24h', async () => {
        const { courseId, student, order } = await purchase();
        await t.db.query(
          `UPDATE orders SET expires_at = now() - interval '2 hours' WHERE id=$1`,
          [order.orderId],
        ); // still PENDING: the sweeper has not run
        await httpBank(nativePayload(order.code, 499000))
          .expect(200)
          .expect({ status: 'COMPLETED' });
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(1);
      });

      it('never fulfils money paid after the window, to a cancelled order, or beyond the reinstatement limit', async () => {
        const late = await purchase();
        await t.db.query(
          `UPDATE orders SET expires_at = now() - interval '1 hour' WHERE id=$1`,
          [late.order.orderId],
        );
        const lateExpiry = await expiresAt(late.order.orderId);
        // the bank booked it 10 minutes after the window closed
        await httpBank(
          sepay(late.order.code, new Date(lateExpiry.getTime() + 10 * 60_000)),
        )
          .expect(200)
          .expect({ status: 'IGNORED' });
        expect(await orderStatus(late.order.orderId)).toBe('EXPIRED');

        const old = await purchase();
        await t.db.query(
          `UPDATE orders SET expires_at = now() - interval '3 days' WHERE id=$1`,
          [old.order.orderId],
        );
        await httpBank(nativePayload(old.order.code, 499000))
          .expect(200)
          .expect({ status: 'IGNORED' });

        const cancelled = await purchase();
        await t.db.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1`, [
          cancelled.order.orderId,
        ]);
        await httpBank(nativePayload(cancelled.order.code, 499000))
          .expect(200)
          .expect({ status: 'IGNORED' });

        for (const { order, student, courseId } of [late, old, cancelled]) {
          expect(await orderStatus(order.orderId)).not.toBe('COMPLETED');
          expect(
            await count('enrollments WHERE user_id=$1 AND course_id=$2', [
              student.id,
              courseId,
            ]),
          ).toBe(0);
          // the money is on record for finance
          expect(
            await count(
              `payment_transactions WHERE order_id=$1 AND status='FAILED'`,
              [order.orderId],
            ),
          ).toBe(1);
        }
      });
    });

    // ---------------------------------------------------- failure + audit
    describe('failure handling and audit', () => {
      it('logs a processing failure as FAILED, answers 5xx, and the gateway retry then succeeds', async () => {
        const { courseId, student, order } = await purchase();
        const payload = nativePayload(order.code, 499000);
        const settlement = t.app.get(PaymentSettlementService);
        const spy = vi
          .spyOn(settlement, 'settle')
          .mockRejectedValueOnce(new Error('database connection lost'));
        try {
          await httpBank(payload).expect(500);
        } finally {
          spy.mockRestore();
        }
        expect(await orderStatus(order.orderId)).toBe('PENDING');
        const failed = await t.db.query(
          `SELECT status, error_message FROM webhook_logs WHERE payload->>'transactionId'=$1`,
          [payload.transactionId],
        );
        expect(failed).toEqual([
          { status: 'FAILED', error_message: 'database connection lost' },
        ]);

        await httpBank(payload).expect(200).expect({ status: 'COMPLETED' });
        const logs = await deliveries('VIETQR', payload.transactionId);
        expect(tally(logs.map((l: { status: string }) => l.status))).toEqual({
          FAILED: 1,
          PROCESSED: 1,
        });
        expect(
          await count('enrollments WHERE user_id=$1 AND course_id=$2', [
            student.id,
            courseId,
          ]),
        ).toBe(1);
      });

      it('keeps the audit trail tamper-proof', async () => {
        const { order } = await purchase();
        const payload = nativePayload(order.code, 499000);
        await httpBank(payload).expect(200);
        const [log] = await t.db.query(
          `SELECT id FROM webhook_logs WHERE status='PROCESSED' AND payload->>'transactionId'=$1`,
          [payload.transactionId],
        );
        for (const sql of [
          `UPDATE webhook_logs SET payload='{}' WHERE id=$1`,
          `UPDATE webhook_logs SET status='FAILED' WHERE id=$1`,
          `DELETE FROM webhook_logs WHERE id=$1`,
        ])
          await expect(t.db.query(sql, [log.id])).rejects.toMatchObject({
            code: '23001',
          });
        const [row] = await t.db.query(
          'SELECT payload FROM webhook_logs WHERE id=$1',
          [log.id],
        );
        expect(row.payload).toEqual(payload);
      });
    });
  },
);
