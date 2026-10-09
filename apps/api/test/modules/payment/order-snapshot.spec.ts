import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseService } from '../../../src/database/database.module.js';
import { CoursePricingService } from '../../../src/courses/pricing/course-pricing.service.js';
import { PaymentProviderEnum } from '../../../src/modules/payment/interfaces/index.js';
import {
  OrderFactoryService,
  type OrderCodeGenerator,
} from '../../../src/modules/payment/order-factory.service.js';
import { OrderQueryService } from '../../../src/modules/payment/order-query.service.js';
import { PaymentTransactionService } from '../../../src/modules/payment/payment-transaction.service.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

/**
 * PAY3-PAY5 persistence invariant: an order is a frozen copy of what the buyer
 * agreed to at checkout. Repricing or renaming a course later must never leak
 * into an existing order, and the database itself refuses to rewrite it.
 */
// Each test registers accounts (password hashing) and courses over HTTP, so
// give them room when the whole suite runs in parallel.
describe('PAY3-5 order snapshot invariant', { timeout: 30_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  let factory: OrderFactoryService;
  let queries: OrderQueryService;
  let ledger: PaymentTransactionService;
  let pricing: CoursePricingService;
  const apiKey = `bank-${randomUUID()}`;

  beforeAll(async () => {
    process.env.BANK_WEBHOOK_API_KEY = apiKey;
    process.env.VIETQR_BANK_ID = '970422';
    process.env.VIETQR_ACCOUNT_NO = '123456789';
    process.env.VIETQR_ACCOUNT_NAME = 'SHANITY';
    t = await learningApp('order-snapshot');
    owner = await t.account('instructor');
    factory = t.app.get(OrderFactoryService);
    queries = t.app.get(OrderQueryService);
    ledger = t.app.get(PaymentTransactionService);
    pricing = t.app.get(CoursePricingService);
  });

  afterAll(async () => {
    await t?.app.close();
    delete process.env.BANK_WEBHOOK_API_KEY;
  });

  /** A published PAID course with the given title and VND price. */
  async function paidCourse(price: number, title = 'Khóa học A') {
    const course = await t.course(owner, 1);
    await t
      .send('patch', `/courses/${course.id}`, owner.session, { title })
      .expect(200);
    await t
      .send('patch', `/courses/${course.id}/pricing`, owner.session, {
        accessType: 'PAID',
        price,
      })
      .expect(200);
    return course.id;
  }

  const reprice = (courseId: string, price: number) =>
    t.send('patch', `/courses/${courseId}/pricing`, owner.session, {
      accessType: 'PAID',
      price,
    });
  const rename = (courseId: string, title: string) =>
    t.send('patch', `/courses/${courseId}`, owner.session, { title });

  const placeOrder = (student: Account, courseIds: string[]) =>
    t
      .http()
      .post('/orders')
      .set('Origin', process.env.WEB_ORIGIN!)
      .set('Cookie', student.session)
      .send({ courseIds });
  const orderDetail = (student: Account, orderId: string) =>
    t.http().get(`/orders/${orderId}`).set('Cookie', student.session);
  const webhook = (body: object) =>
    t
      .http()
      .post('/payments/webhook/vietqr')
      .set('x-api-key', apiKey)
      .send(body);
  const pay = (code: string, amount: number, memo = code) =>
    webhook({
      transactionId: `FT-${randomUUID()}`,
      amount,
      transferContent: memo,
    });
  /** Unique across runs: the shared *_test database is not reset per run. */
  const uid = () => randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  const uniqueCode = () => `SHAN-20260101-${uid().slice(0, 4)}`;
  const count = async (sql: string, params: unknown[] = []) => {
    const [{ n }] = await t.db.query(
      `SELECT count(*)::int AS n FROM ${sql}`,
      params,
    );
    return n as number;
  };

  describe('the T1 / T2 scenario', () => {
    it('keeps the T1 order at 499.000đ after the course becomes 799.000đ', async () => {
      const courseId = await paidCourse(499000, 'Khóa học A');
      const userA = await t.account();
      const userB = await t.account();

      // T1: User A buys Course X at 499.000đ.
      const t1 = (await placeOrder(userA, [courseId]).expect(201)).body;
      expect(t1).toMatchObject({
        subtotal: 499000,
        discountTotal: 0,
        finalTotal: 499000,
      });

      // T2: the instructor reprices and renames the course.
      await reprice(courseId, 799000).expect(200);
      await rename(courseId, 'Khóa học A (2026 Edition)').expect(200);
      const live = await t
        .http()
        .get(`/courses/${courseId}`)
        .set('Cookie', owner.session)
        .expect(200);
      expect(live.body).toMatchObject({
        price: 799000,
        title: 'Khóa học A (2026 Edition)',
      });

      // Fetching A's order again: still the T1 data, read from the snapshot.
      const refetched = (await orderDetail(userA, t1.orderId).expect(200)).body;
      expect(refetched.finalTotal).toBe(499000);
      expect(refetched.subtotal).toBe(499000);
      expect(refetched.items).toHaveLength(1);
      expect(refetched.items[0]).toMatchObject({
        courseId,
        courseTitleSnapshot: 'Khóa học A',
        unitPriceSnapshot: 499000,
        discountSnapshot: 0,
        finalPriceSnapshot: 499000,
        currency: 'VND',
      });
      // Checkout (and so the QR) still asks for the frozen amount.
      const checkout = await t
        .http()
        .post(`/orders/${t1.orderId}/checkout`)
        .set('Origin', process.env.WEB_ORIGIN!)
        .set('Cookie', userA.session)
        .send({ provider: 'VIETQR' })
        .expect(201);
      expect(checkout.body.amount).toBe(499000);
      expect(new URL(checkout.body.qrCodeUrl).searchParams.get('amount')).toBe(
        '499000',
      );

      // A new order at T2 picks up the new price and title.
      const t2 = (await placeOrder(userB, [courseId]).expect(201)).body;
      expect(t2.finalTotal).toBe(799000);
      expect(t2.items[0]).toMatchObject({
        courseTitleSnapshot: 'Khóa học A (2026 Edition)',
        unitPriceSnapshot: 799000,
      });

      // Paying the frozen 499.000đ completes A's order even though the
      // course now costs 799.000đ; B must still pay the new price.
      await pay(t1.code, 499000).expect(200).expect({ status: 'COMPLETED' });
      await pay(t2.code, 499000)
        .expect(200)
        .expect({ status: 'PARTIAL_AMOUNT' });
      expect(await count('enrollments WHERE user_id=$1', [userA.id])).toBe(1);
      expect(await count('enrollments WHERE user_id=$1', [userB.id])).toBe(0);
      expect(
        (await orderDetail(userA, t1.orderId).expect(200)).body.finalTotal,
      ).toBe(499000);
    });

    it('is unaffected by direct SQL edits of the course, even to FREE', async () => {
      const courseId = await paidCourse(499000, 'Khóa học A');
      const userA = await t.account();
      const order = await factory.createOrder(userA.id, {
        courseIds: [courseId],
      });

      await t.db.query(
        `UPDATE courses SET price = 799000, title = 'Khóa học A (2026 Edition)' WHERE id = $1`,
        [courseId],
      );
      let details = await queries.getOrderDetails(order.orderId, {
        staff: true,
      });
      expect(details.finalTotal).toBe(499000);
      expect(details.items[0]).toMatchObject({
        unitPriceSnapshot: 499000,
        courseTitleSnapshot: 'Khóa học A',
      });

      await t.db.query(
        `UPDATE courses SET access_type = 'FREE', price = 0, title = 'Miễn phí' WHERE id = $1`,
        [courseId],
      );
      details = await queries.getOrderDetails(order.orderId, { staff: true });
      expect(details.finalTotal).toBe(499000);
      expect(details.items[0]).toMatchObject({
        unitPriceSnapshot: 499000,
        finalPriceSnapshot: 499000,
        courseTitleSnapshot: 'Khóa học A',
      });
    });

    it('lists history from snapshots and hides other users orders', async () => {
      const courseId = await paidCourse(250000, 'Lịch sử');
      const user = await t.account();
      const stranger = await t.account();
      const order = (await placeOrder(user, [courseId]).expect(201)).body;
      await reprice(courseId, 900000).expect(200);

      const list = (
        await t.http().get('/orders').set('Cookie', user.session).expect(200)
      ).body;
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        orderId: order.orderId,
        finalTotal: 250000,
      });
      expect(list[0].items[0].unitPriceSnapshot).toBe(250000);
      await orderDetail(stranger, order.orderId).expect(404);
      await t
        .http()
        .get('/orders')
        .set('Cookie', stranger.session)
        .expect(200)
        .expect([]);
    });
  });

  describe('read path', () => {
    it('never references the Course entity or courses table', () => {
      const strip = (path: string) =>
        readFileSync(new URL(path, import.meta.url), 'utf8')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/\/\/.*$/gm, '');
      for (const file of [
        '../../../src/modules/payment/order-query.service.ts',
        '../../../src/modules/payment/order-view.ts',
      ]) {
        const source = strip(file);
        expect(source, file).not.toMatch(/\bCourse\b/);
        expect(source, file).not.toMatch(/course\.entity/);
        expect(source, file).not.toMatch(/\b(FROM|JOIN|UPDATE)\s+"?courses\b/i);
        expect(source, file).not.toMatch(/leftJoin|innerJoin|relations\s*:/);
      }
    });

    it('exposes payment events without the raw provider payload', async () => {
      const courseId = await paidCourse(100000);
      const user = await t.account();
      const order = (await placeOrder(user, [courseId]).expect(201)).body;
      await pay(order.code, 100000).expect(200);
      const detail = (await orderDetail(user, order.orderId).expect(200)).body;
      expect(detail.payments).toHaveLength(1);
      expect(detail.payments[0]).toMatchObject({
        provider: 'VIETQR',
        amount: 100000,
        feeAmount: 0,
        currency: 'VND',
        status: 'SUCCESS',
      });
      expect(JSON.stringify(detail)).not.toContain('rawPayload');
      expect(JSON.stringify(detail)).not.toContain('raw_payload');
    });
  });

  describe('OrderFactoryService', () => {
    it('snapshots several courses into one order in the requested order', async () => {
      const a = await paidCourse(499000, 'Khóa A');
      const b = await paidCourse(300000, 'Khóa B');
      const user = await t.account();
      const order = (await placeOrder(user, [b, a]).expect(201)).body;

      expect(order.subtotal).toBe(799000);
      expect(order.discountTotal).toBe(0);
      expect(order.finalTotal).toBe(799000);
      expect(order.items.map((i: { courseId: string }) => i.courseId)).toEqual([
        b,
        a,
      ]);
      expect(
        order.items.map(
          (i: { courseTitleSnapshot: string }) => i.courseTitleSnapshot,
        ),
      ).toEqual(['Khóa B', 'Khóa A']);
      expect(order.code).toMatch(/^SHAN-\d{8}-[A-Z2-9]{4}$/);
      expect(order.status).toBe('PENDING');
    });

    it('rolls back completely when any course is not purchasable', async () => {
      const paid = await paidCourse(100000);
      const free = (await t.course(owner, 1)).id;
      const draft = await paidCourse(100000);
      await t.db.query(`UPDATE courses SET status='draft' WHERE id=$1`, [
        draft,
      ]);
      const usd = await paidCourse(100000);
      await t
        .send('patch', `/courses/${usd}/pricing`, owner.session, {
          accessType: 'PAID',
          price: 1999,
          currency: 'USD',
        })
        .expect(200);
      const enrolled = await paidCourse(100000);
      const user = await t.account();
      await t.db.query(
        'INSERT INTO enrollments(user_id, course_id) VALUES ($1,$2)',
        [user.id, enrolled],
      );
      const before = {
        orders: await count('orders WHERE user_id=$1', [user.id]),
        // Scoped to this buyer: other suites insert order items concurrently.
        items: await count(
          'order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id=$1)',
          [user.id],
        ),
      };

      await placeOrder(user, [paid, free]).expect(400);
      await placeOrder(user, [paid, usd]).expect(400);
      await placeOrder(user, [paid, enrolled]).expect(400);
      await placeOrder(user, [paid, draft]).expect(404);
      await placeOrder(user, [paid, randomUUID()]).expect(404);
      await placeOrder(user, [paid, paid]).expect(400);
      await placeOrder(user, []).expect(400);
      await placeOrder(user, ['not-a-uuid']).expect(400);
      await t
        .http()
        .post('/orders')
        .set('Origin', process.env.WEB_ORIGIN!)
        .set('Cookie', user.session)
        .send({ courseId: paid })
        .expect(400);

      expect({
        orders: await count('orders WHERE user_id=$1', [user.id]),
        // Scoped to this buyer: other suites insert order items concurrently.
        items: await count(
          'order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id=$1)',
          [user.id],
        ),
      }).toEqual(before);
    });

    it('retries a fresh code on collision and gives up cleanly', async () => {
      const courseId = await paidCourse(100000);
      const database = t.app.get(DatabaseService);
      const sequence = (codes: string[]): OrderCodeGenerator => {
        let index = 0;
        return () => codes[Math.min(index++, codes.length - 1)]!;
      };
      // A repeated identical request by one buyer would reuse their order, so
      // each colliding order belongs to a different buyer.
      const [user, user2, user3] = await Promise.all([
        t.account(),
        t.account(),
        t.account(),
      ]);
      const taken = uniqueCode();
      const fresh = `SHAN-20260102-${uid().slice(0, 4)}`;
      const first = await new OrderFactoryService(
        database,
        sequence([taken]),
      ).createOrder(user.id, { courseIds: [courseId] });
      expect(first.code).toBe(taken);

      const second = await new OrderFactoryService(
        database,
        sequence([taken, fresh]),
      ).createOrder(user2.id, { courseIds: [courseId] });
      expect(second.code).toBe(fresh);

      // Scoped to this test's course: other suites create orders in parallel.
      const items = () => count('order_items WHERE course_id=$1', [courseId]);
      const itemsBefore = await items();
      await expect(
        new OrderFactoryService(database, sequence([taken])).createOrder(
          user3.id,
          { courseIds: [courseId] },
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(await items()).toBe(itemsBefore);
    });

    it('creates distinct codes for parallel checkouts', async () => {
      const courseId = await paidCourse(100000);
      const users = await Promise.all(
        Array.from({ length: 12 }, () => t.account()),
      );
      const orders = await Promise.all(
        users.map((user) =>
          factory.createOrder(user.id, { courseIds: [courseId] }),
        ),
      );
      expect(new Set(orders.map((order) => order.code)).size).toBe(12);
    });
  });

  describe('database guarantees', () => {
    it('refuses to rewrite or delete a frozen order', async () => {
      const courseId = await paidCourse(499000);
      const user = await t.account();
      const order = await factory.createOrder(user.id, {
        courseIds: [courseId],
      });
      const refuses = (sql: string) =>
        expect(t.db.query(sql, [order.orderId])).rejects.toMatchObject({
          code: '23001',
        });

      await refuses(
        `UPDATE order_items SET unit_price_snapshot = 1, final_price_snapshot = 1 WHERE order_id = $1`,
      );
      await refuses(
        `UPDATE order_items SET course_title_snapshot = 'x' WHERE order_id = $1`,
      );
      await refuses(`DELETE FROM order_items WHERE order_id = $1`);
      await refuses(
        `UPDATE orders SET subtotal = 1, final_total = 1 WHERE id = $1`,
      );
      await refuses(`UPDATE orders SET currency = 'USD' WHERE id = $1`);
      await refuses(`UPDATE orders SET code = 'HACKED' WHERE id = $1`);
      await refuses(`DELETE FROM orders WHERE id = $1`);
      // status and expiry remain mutable
      await t.db.query(`UPDATE orders SET expires_at = now() WHERE id = $1`, [
        order.orderId,
      ]);
      expect(
        (await queries.getOrderDetails(order.orderId, { staff: true }))
          .finalTotal,
      ).toBe(499000);
    });

    it('enforces the order status state machine', async () => {
      const courseId = await paidCourse(100000);
      const user = await t.account();
      const order = await factory.createOrder(user.id, {
        courseIds: [courseId],
      });
      await t.db.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1`, [
        order.orderId,
      ]);
      await expect(
        t.db.query(`UPDATE orders SET status='COMPLETED' WHERE id=$1`, [
          order.orderId,
        ]),
      ).rejects.toMatchObject({ code: '23001' });
    });

    it('rejects orders whose totals do not match their items at COMMIT', async () => {
      const courseId = await paidCourse(100000);
      const user = await t.account();
      const database = t.app.get(DatabaseService);
      const codes = {
        NOIT: uniqueCode(),
        SUMS: uniqueCode(),
        MATH: uniqueCode(),
        GOOD: uniqueCode(),
      };
      const insertOrder = (
        manager: { query: (sql: string, params: unknown[]) => Promise<any> },
        code: string,
        subtotal: number,
        finalTotal: number,
      ) =>
        manager.query(
          `INSERT INTO orders(code,user_id,currency,subtotal,discount_total,final_total,status,payment_provider,expires_at)
           VALUES ($1,$2,'VND',$3::bigint,$3::bigint - $4::bigint,$4::bigint,'PENDING','VIETQR',now() + interval '15 minutes') RETURNING id`,
          [code, user.id, subtotal, finalTotal],
        );
      const insertItem = (
        manager: { query: (sql: string, params: unknown[]) => Promise<any> },
        orderId: string,
        unit: number,
      ) =>
        manager.query(
          `INSERT INTO order_items(order_id,course_id,position,course_title_snapshot,unit_price_snapshot,discount_snapshot,final_price_snapshot,currency)
           VALUES ($1,$2,0,'t',$3,0,$3,'VND')`,
          [orderId, courseId, unit],
        );

      // header without items
      await expect(
        database.dataSource.transaction((m) =>
          insertOrder(m, codes.NOIT, 100000, 100000),
        ),
      ).rejects.toMatchObject({ code: '23514' });
      // items that do not add up to the header
      await expect(
        database.dataSource.transaction(async (m) => {
          const [{ id }] = await insertOrder(m, codes.SUMS, 100000, 100000);
          await insertItem(m, id, 90000);
        }),
      ).rejects.toMatchObject({ code: '23514' });
      // header total that breaks finalTotal = subtotal - discountTotal
      await expect(
        t.db.query(
          `INSERT INTO orders(code,user_id,currency,subtotal,discount_total,final_total,status,payment_provider,expires_at)
           VALUES ($2,$1,'VND',100,0,90,'PENDING','VIETQR',now())`,
          [user.id, codes.MATH],
        ),
      ).rejects.toMatchObject({ constraint: 'orders_final_total_check' });
      // consistent in either insertion order commits
      await database.dataSource.transaction(async (m) => {
        const [{ id }] = await insertOrder(m, codes.GOOD, 100000, 100000);
        await insertItem(m, id, 100000);
      });
      expect(await count('orders WHERE code = $1', [codes.GOOD])).toBe(1);
      expect(
        await count('orders WHERE code = ANY($1)', [[codes.NOIT, codes.SUMS]]),
      ).toBe(0);
    });

    it('keeps settled ledger rows immutable but lets INITIATED rows complete', async () => {
      const courseId = await paidCourse(100000);
      const chargeId = `ch_${uid()}`;
      const user = await t.account();
      const order = await factory.createOrder(user.id, {
        courseIds: [courseId],
      });
      const [{ id }] = await t.db.query(
        `INSERT INTO payment_transactions(order_id,provider,amount,currency,status,raw_payload)
         VALUES ($1,'STRIPE',100000,'VND','INITIATED','{"stage":"created"}') RETURNING id`,
        [order.orderId],
      );
      await t.db.query(
        `UPDATE payment_transactions SET status='SUCCESS', provider_transaction_id=$2, fee_amount=3000,
           raw_payload='{"stage":"captured"}' WHERE id=$1`,
        [id, chargeId],
      );
      for (const sql of [
        `UPDATE payment_transactions SET amount=1 WHERE id=$1`,
        `UPDATE payment_transactions SET status='FAILED' WHERE id=$1`,
        `UPDATE payment_transactions SET raw_payload='{}' WHERE id=$1`,
        `DELETE FROM payment_transactions WHERE id=$1`,
      ])
        await expect(t.db.query(sql, [id])).rejects.toMatchObject({
          code: '23001',
        });
      // the same provider id may exist for another provider, not twice for one
      await t.db.query(
        `INSERT INTO payment_transactions(order_id,provider,provider_transaction_id,amount,currency,status,raw_payload)
         VALUES ($1,'MOMO',$2,1,'VND','FAILED','{}')`,
        [order.orderId, chargeId],
      );
      await expect(
        t.db.query(
          `INSERT INTO payment_transactions(order_id,provider,provider_transaction_id,amount,currency,status,raw_payload)
           VALUES ($1,'STRIPE',$2,1,'VND','FAILED','{}')`,
          [order.orderId, chargeId],
        ),
      ).rejects.toMatchObject({
        constraint: 'payment_transactions_provider_txn_key',
      });
    });
  });

  describe('payment ledger', () => {
    it('grants every item on payment and records a complete ledger row', async () => {
      const a = await paidCourse(499000, 'Khóa A');
      const b = await paidCourse(300000, 'Khóa B');
      const user = await t.account();
      const order = (await placeOrder(user, [a, b]).expect(201)).body;
      // lower case and without dashes, like a real bank memo
      const memo = `nguyen van a ck ${order.code.replaceAll('-', '').toLowerCase()}`;
      const transactionId = `FT-${randomUUID()}`;
      const body = { transactionId, amount: 799000, transferContent: memo };
      await webhook(body).expect(200).expect({ status: 'COMPLETED' });

      expect(await count('enrollments WHERE user_id=$1', [user.id])).toBe(2);
      const [row] = await t.db.query(
        'SELECT * FROM payment_transactions WHERE provider_transaction_id=$1',
        [transactionId],
      );
      expect(row).toMatchObject({
        order_id: order.orderId,
        provider: 'VIETQR',
        amount: '799000',
        fee_amount: '0',
        currency: 'VND',
        status: 'SUCCESS',
        transfer_content: memo,
        raw_payload: body,
      });
      expect(row.received_at).toBeInstanceOf(Date);
      expect(row.updated_at).toBeInstanceOf(Date);
    });

    it('keeps evidence of money paid to an order that can no longer be fulfilled', async () => {
      const courseId = await paidCourse(100000);
      const user = await t.account();
      const cancelled = (await placeOrder(user, [courseId]).expect(201)).body;
      await t
        .send('patch', `/courses/${courseId}/pricing`, owner.session, {
          accessType: 'FREE',
        })
        .expect(200);
      await t
        .http()
        .get(`/orders/${cancelled.orderId}/status`)
        .set('Cookie', user.session)
        .expect(200)
        .expect(({ body }) => expect(body.status).toBe('CANCELLED'));

      const transactionId = `FT-${randomUUID()}`;
      await webhook({
        transactionId,
        amount: 100000,
        transferContent: cancelled.code,
      })
        .expect(200)
        .expect({ status: 'IGNORED' });

      expect(await count('enrollments WHERE user_id=$1', [user.id])).toBe(0);
      const [row] = await t.db.query(
        'SELECT status, raw_payload FROM payment_transactions WHERE provider_transaction_id=$1',
        [transactionId],
      );
      expect(row.status).toBe('FAILED');
      expect(row.raw_payload).toMatchObject({ transactionId, amount: 100000 });
      const [{ status }] = await t.db.query(
        'SELECT status FROM orders WHERE id=$1',
        [cancelled.orderId],
      );
      expect(status).toBe('CANCELLED');
    });

    it('expires an order paid after its window and records the attempt', async () => {
      const courseId = await paidCourse(100000);
      const user = await t.account();
      const order = (await placeOrder(user, [courseId]).expect(201)).body;
      await t.db.query(
        `UPDATE orders SET expires_at = now() - interval '3 days' WHERE id=$1`,
        [order.orderId],
      );
      // no bank timestamp, and past the 24h reinstatement window
      await pay(order.code, 100000).expect(200).expect({ status: 'IGNORED' });
      const [{ status }] = await t.db.query(
        'SELECT status FROM orders WHERE id=$1',
        [order.orderId],
      );
      expect(status).toBe('EXPIRED');
      expect(
        await count('payment_transactions WHERE order_id=$1', [order.orderId]),
      ).toBe(1);
      expect(await count('enrollments WHERE user_id=$1', [user.id])).toBe(0);
    });

    it('is idempotent per provider event and rejects id reuse across orders', async () => {
      const courseId = await paidCourse(100000);
      const [user, user2] = await Promise.all([t.account(), t.account()]);
      const first = await factory.createOrder(user.id, {
        courseIds: [courseId],
      });
      const second = await factory.createOrder(user2.id, {
        courseIds: [courseId],
      });
      const database = t.app.get(DatabaseService);
      const input = {
        orderId: first.orderId,
        provider: PaymentProviderEnum.STRIPE,
        providerTransactionId: `ch_${uid()}`,
        amount: 100000,
        currency: first.currency,
        status: 'FAILED' as never,
        rawPayload: { event: 1 },
      };
      const one = await database.dataSource.transaction((m) =>
        ledger.record(m, input),
      );
      const again = await database.dataSource.transaction((m) =>
        ledger.record(m, input),
      );
      expect(one.created).toBe(true);
      expect(again).toMatchObject({ created: false });
      expect(again.transaction.id).toBe(one.transaction.id);
      await expect(
        database.dataSource.transaction((m) =>
          ledger.record(m, { ...input, orderId: second.orderId }),
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        database.dataSource.transaction((m) =>
          ledger.record(m, {
            ...input,
            providerTransactionId: 'x'.repeat(101),
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('records partial then full refunds as new rows and marks the order REFUNDED', async () => {
      const courseId = await paidCourse(499000);
      const user = await t.account();
      const order = (await placeOrder(user, [courseId]).expect(201)).body;
      const rf = Object.fromEntries(
        [0, 1, 2, 3, 4].map((n) => [n, `RF${n}-${uid()}`]),
      ) as Record<number, string>;
      const refund = (id: string, amount: number) =>
        ledger.recordRefund({
          orderId: order.orderId,
          provider: PaymentProviderEnum.VIETQR,
          providerTransactionId: id,
          amount,
          rawPayload: { refund: id },
        });

      await expect(refund(rf[0]!, 1000)).rejects.toMatchObject({ status: 409 }); // not paid yet
      await pay(order.code, 499000).expect(200);

      const partial = await refund(rf[1]!, 100000);
      expect(partial.transaction.status).toBe('PARTIALLY_REFUNDED');
      expect(
        (await queries.getOrderDetails(order.orderId, { staff: true })).status,
      ).toBe('COMPLETED');
      await expect(refund(rf[2]!, 399001)).rejects.toMatchObject({
        status: 400,
      });
      expect((await refund(rf[1]!, 100000)).created).toBe(false); // idempotent

      const full = await refund(rf[3]!, 399000);
      expect(full.transaction.status).toBe('REFUNDED');
      const details = await queries.getOrderDetails(order.orderId, {
        staff: true,
      });
      expect(details.status).toBe('REFUNDED');
      expect(details.payments!.map((p) => [p.status, p.amount])).toEqual([
        ['SUCCESS', 499000],
        ['PARTIALLY_REFUNDED', 100000],
        ['REFUNDED', 399000],
      ]);
      // the original payment row is never rewritten
      const [original] = await t.db.query(
        `SELECT status, amount FROM payment_transactions WHERE order_id=$1 AND status='SUCCESS'`,
        [order.orderId],
      );
      expect(original).toMatchObject({ status: 'SUCCESS', amount: '499000' });
      await expect(refund(rf[4]!, 1)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('hardening', () => {
    it('accepts upper-case UUIDs and preserves the buyer item order', async () => {
      const a = await paidCourse(100000, 'A');
      const b = await paidCourse(200000, 'B');
      const c = await paidCourse(300000, 'C');
      const user = await t.account();
      const created = (
        await placeOrder(
          user,
          [c, a, b].map((id) => id.toUpperCase()),
        ).expect(201)
      ).body;
      expect(
        created.items.map((i: { courseId: string }) => i.courseId),
      ).toEqual([c, a, b]);
      const again = (await orderDetail(user, created.orderId).expect(200)).body;
      expect(
        again.items.map(
          (i: { courseTitleSnapshot: string }) => i.courseTitleSnapshot,
        ),
      ).toEqual(['C', 'A', 'B']);
    });

    it('caps unpaid orders per buyer and frees the quota when they expire', async () => {
      const courses = [];
      for (let i = 0; i < 11; i++) courses.push(await paidCourse(100000));
      const user = await t.account();
      for (const courseId of courses.slice(0, 10))
        await placeOrder(user, [courseId]).expect(201);
      await placeOrder(user, [courses[10]!])
        .expect(429)
        .expect(({ body }) =>
          expect(body.message).toBe('TOO_MANY_PENDING_ORDERS'),
        );
      // asking again for an order that already exists is not a new order
      await placeOrder(user, [courses[0]!]).expect(201);
      await t.db.query(
        `UPDATE orders SET expires_at = now() - interval '1 minute' WHERE user_id=$1`,
        [user.id],
      );
      await placeOrder(user, [courses[10]!]).expect(201);
    });

    it('returns the same unpaid order for a repeated identical request', async () => {
      const a = await paidCourse(100000);
      const b = await paidCourse(200000);
      const user = await t.account();
      const first = (await placeOrder(user, [a, b]).expect(201)).body;
      const again = (await placeOrder(user, [b, a]).expect(201)).body;
      expect(again.orderId).toBe(first.orderId);
      expect(again.code).toBe(first.code);
      // a different set, or a finished order, is a new order
      expect((await placeOrder(user, [a]).expect(201)).body.orderId).not.toBe(
        first.orderId,
      );
      await pay(first.code, 300000).expect(200);
      expect(await count('orders WHERE user_id=$1', [user.id])).toBe(2);
    });

    it('requires a same-origin request for order mutations', async () => {
      const courseId = await paidCourse(100000);
      const user = await t.account();
      await t
        .http()
        .post('/orders')
        .set('Cookie', user.session)
        .send({ courseIds: [courseId] })
        .expect(403);
      await t
        .http()
        .post('/orders')
        .set('Origin', 'https://evil.example')
        .set('Cookie', user.session)
        .send({ courseIds: [courseId] })
        .expect(403);
    });

    it('survives absurd pagination and lets only staff read other buyers orders', async () => {
      const user = await t.account();
      await t
        .http()
        .get('/orders?offset=99999999999999999999')
        .set('Cookie', user.session)
        .expect(200)
        .expect([]);
      await t
        .http()
        .get('/orders?limit=abc')
        .set('Cookie', user.session)
        .expect(400);
      const courseId = await paidCourse(100000);
      const created = await factory.createOrder(user.id, {
        courseIds: [courseId],
      });
      await expect(
        queries.getOrderDetails(created.orderId, { userId: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        (await queries.getOrderDetails(created.orderId, { staff: true }))
          .orderId,
      ).toBe(created.orderId);
    });

    it('never lets a finished order gain item lines', async () => {
      const courseId = await paidCourse(100000);
      const other = await paidCourse(1);
      const user = await t.account();
      const created = (await placeOrder(user, [courseId]).expect(201)).body;
      await pay(created.code, 100000).expect(200);
      await expect(
        t.db.query(
          `INSERT INTO order_items(order_id,course_id,position,course_title_snapshot,unit_price_snapshot,discount_snapshot,final_price_snapshot,currency)
           VALUES ($1,$2,1,'free rider',0,0,0,'VND')`,
          [created.orderId, other],
        ),
      ).rejects.toMatchObject({ code: '23001' });
    });

    it('cancels and expires concurrently without deadlocking', async () => {
      const a = await paidCourse(100000);
      const b = await paidCourse(100000);
      const users = await Promise.all(
        Array.from({ length: 6 }, () => t.account()),
      );
      const orders = await Promise.all(
        users.map((u, i) =>
          factory.createOrder(u.id, { courseIds: i % 2 ? [a, b] : [b, a] }),
        ),
      );
      await t.db.query(
        `UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id = ANY($1)`,
        [orders.slice(0, 3).map((o) => o.orderId)],
      );
      const { PaymentService } =
        await import('../../../src/modules/payment/payment.service.js');
      const results = await Promise.allSettled([
        t.app.get(PaymentService).expirePendingOrders(),
        pricing.updateCoursePricing(
          a,
          { accessType: 'FREE' as never },
          owner.id,
        ),
        pricing.updateCoursePricing(
          b,
          { accessType: 'FREE' as never },
          owner.id,
        ),
      ]);
      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      const statuses = await t.db.query(
        'SELECT status FROM orders WHERE id = ANY($1)',
        [orders.map((o) => o.orderId)],
      );
      expect(
        statuses.every((r: { status: string }) => r.status !== 'PENDING'),
      ).toBe(true);
    });
  });

  describe('repricing interactions', () => {
    it('cancels pending orders containing the course, leaves completed ones', async () => {
      const a = await paidCourse(100000);
      const b = await paidCourse(200000);
      const buyer = await t.account();
      const waiting = await t.account();
      const done = (await placeOrder(buyer, [a, b]).expect(201)).body;
      await pay(done.code, 300000).expect(200);
      const pending = (await placeOrder(waiting, [a, b]).expect(201)).body;
      const unrelated = (await placeOrder(waiting, [b]).expect(201)).body;

      const result = await pricing.updateCoursePricing(
        a,
        { accessType: 'FREE' as never },
        owner.id,
      );
      expect(result.cancelledPendingOrders).toBe(1);
      const statuses = Object.fromEntries(
        (
          await t.db.query('SELECT id, status FROM orders WHERE id = ANY($1)', [
            [done.orderId, pending.orderId, unrelated.orderId],
          ])
        ).map((row: { id: string; status: string }) => [row.id, row.status]),
      );
      expect(statuses).toEqual({
        [done.orderId]: 'COMPLETED',
        [pending.orderId]: 'CANCELLED',
        [unrelated.orderId]: 'PENDING',
      });
      expect(await count('enrollments WHERE user_id=$1', [buyer.id])).toBe(2);
      expect(
        (await queries.getOrderDetails(done.orderId, { staff: true }))
          .finalTotal,
      ).toBe(300000);
    });

    it('survives checkouts, repricings and webhooks racing without deadlock', async () => {
      const courseId = await paidCourse(100000);
      const buyers = await Promise.all(
        Array.from({ length: 8 }, () => t.account()),
      );
      const prices = [110000, 120000, 130000, 140000];

      // Orders created concurrently with repricing see exactly one price each.
      const results = await Promise.allSettled([
        ...buyers.map((b) =>
          factory.createOrder(b.id, { courseIds: [courseId] }),
        ),
        ...prices.map((price) =>
          pricing.updateCoursePricing(
            courseId,
            { accessType: 'PAID' as never, price },
            owner.id,
          ),
        ),
      ]);
      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      const orders = results
        .slice(0, buyers.length)
        .map(
          (r) =>
            (
              r as PromiseFulfilledResult<
                Awaited<ReturnType<typeof factory.createOrder>>
              >
            ).value,
        );
      for (const order of orders) {
        expect([100000, ...prices]).toContain(order.finalTotal);
        expect(order.items[0]!.unitPriceSnapshot).toBe(order.finalTotal);
      }

      // Webhooks completing those orders race a further round of repricing.
      const settled = await Promise.allSettled([
        ...orders.map((order) => pay(order.code, order.finalTotal)),
        ...[150000, 160000, 170000, 180000].map((price) =>
          pricing.updateCoursePricing(
            courseId,
            { accessType: 'PAID' as never, price },
            owner.id,
          ),
        ),
      ]);
      expect(settled.filter((r) => r.status === 'rejected')).toEqual([]);
      for (const outcome of settled.slice(0, orders.length)) {
        const response = (
          outcome as PromiseFulfilledResult<{
            status: number;
            body: { status: string };
          }>
        ).value;
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('COMPLETED');
      }
      expect(await count('enrollments WHERE course_id=$1', [courseId])).toBe(8);
    });
  });
});
