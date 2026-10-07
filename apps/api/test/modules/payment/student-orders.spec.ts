import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { learningApp, type Account } from '../../support/learning-fixture.js';

const uid = () => randomUUID().replaceAll('-', '').slice(0, 10);

/** PAY14-16 student-facing API: status polling, order history, free enroll. */
describe('PAY14-16 student payment API', { timeout: 60_000 }, () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let owner: Account;
  const bankKey = `bank-${uid()}${uid()}${uid()}`;
  const origin = () => process.env.WEB_ORIGIN!;

  beforeAll(async () => {
    Object.assign(process.env, {
      BANK_WEBHOOK_API_KEY: bankKey,
      VIETQR_BANK_ID: 'MB',
      VIETQR_BANK_NAME: 'MB Bank',
      VIETQR_ACCOUNT_NO: '0123456789',
      VIETQR_ACCOUNT_NAME: 'SHANITY EDU',
    });
    t = await learningApp('student-orders');
    owner = await t.account('instructor');
  });
  afterAll(async () => {
    await t?.app.close();
    delete process.env.BANK_WEBHOOK_API_KEY;
    delete process.env.VIETQR_BANK_NAME;
  });

  async function paidCourse(price = 499000, title = 'Khóa học A') {
    const course = await t.course(owner, 1);
    await t.send('patch', `/courses/${course.id}`, owner.session, { title });
    await t
      .send('patch', `/courses/${course.id}/pricing`, owner.session, {
        accessType: 'PAID',
        price,
      })
      .expect(200);
    const [{ slug }] = await t.db.query(
      'SELECT slug FROM courses WHERE id=$1',
      [course.id],
    );
    return { id: course.id, slug: slug as string };
  }
  const buy = (user: Account, ids: string[], prefix = '') =>
    t
      .http()
      .post(`${prefix}/orders`)
      .set('Origin', origin())
      .set('Cookie', user.session)
      .send({ courseIds: ids });
  const get = (user: Account, path: string) =>
    t.http().get(path).set('Cookie', user.session);
  const pay = (code: string, amount: number, id = `FT-${uid()}`) =>
    t
      .http()
      .post('/payments/webhook/vietqr')
      .set('x-api-key', bankKey)
      .send({
        transactionId: id,
        amount,
        transferContent: code.replaceAll('-', ''),
      });

  describe('GET /orders/:ref/status (poll target)', () => {
    it('is tiny, addressed by code or id, and flips to paid on the webhook', async () => {
      const course = await paidCourse();
      const user = await t.account();
      const order = (await buy(user, [course.id]).expect(201)).body;

      for (const path of [
        `/orders/${order.code}/status`,
        `/api/v1/orders/${order.code}/status`,
        `/orders/${order.orderId}/status`,
        `/orders/${order.code.toLowerCase()}/status`,
      ]) {
        const { body } = await get(user, path).expect(200);
        expect(Object.keys(body).sort()).toEqual([
          'expiresAt',
          'isPaid',
          'serverTime',
          'status',
        ]);
        expect(body).toMatchObject({ status: 'PENDING', isPaid: false });
      }
      const { body: before } = await get(user, `/orders/${order.code}/status`);
      expect(new Date(before.expiresAt).getTime()).toBeGreaterThan(
        new Date(before.serverTime).getTime(),
      );

      await pay(order.code, 499000).expect(200);
      await get(user, `/api/v1/orders/${order.code}/status`)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({ status: 'COMPLETED', isPaid: true }),
        );
    });

    it('does not reveal other buyers orders or crash on junk refs', async () => {
      const course = await paidCourse();
      const user = await t.account();
      const stranger = await t.account();
      const order = (await buy(user, [course.id]).expect(201)).body;
      await get(stranger, `/orders/${order.code}/status`).expect(404);
      await get(stranger, `/orders/${order.orderId}/status`).expect(404);
      for (const ref of [
        'nope',
        'SHAN',
        "x'; DROP TABLE orders;--",
        'SHAN-99999999-ZZZZ',
      ])
        await get(user, `/orders/${encodeURIComponent(ref)}/status`).expect(
          404,
        );
      await t.http().get(`/orders/${order.code}/status`).expect(401);
    });
  });

  describe('GET /orders/:ref (checkout page data)', () => {
    it('returns the frozen summary with navigation slugs and resume flag', async () => {
      const course = await paidCourse(499000, 'Khóa học A');
      const user = await t.account();
      const order = (await buy(user, [course.id]).expect(201)).body;
      await t.send('patch', `/courses/${course.id}`, owner.session, {
        title: 'Đã đổi tên',
      });
      const { body } = await get(user, `/api/v1/orders/${order.code}`).expect(
        200,
      );
      expect(body).toMatchObject({
        code: order.code,
        status: 'PENDING',
        finalTotal: 499000,
        canResume: true,
        providerTransactionId: null,
        items: [
          {
            courseTitleSnapshot: 'Khóa học A',
            courseSlug: course.slug,
            finalPriceSnapshot: 499000,
          },
        ],
      });
      expect(body.payments).toEqual([]);
      await get(await t.account(), `/orders/${order.code}`).expect(404);
    });
  });

  describe('checkout payload and methods', () => {
    it('returns bank-transfer details for the copy buttons', async () => {
      const course = await paidCourse(250000);
      const user = await t.account();
      const order = (await buy(user, [course.id]).expect(201)).body;
      const { body } = await t
        .http()
        .post(`/api/v1/orders/${order.code}/checkout`)
        .set('Origin', origin())
        .set('Cookie', user.session)
        .send({ provider: 'VIETQR' })
        .expect(201);
      expect(body.transfer).toEqual({
        bankId: 'MB',
        bankName: 'MB Bank',
        accountNo: '0123456789',
        accountName: 'SHANITY EDU',
        amount: 250000,
        content: order.code.replaceAll('-', ''),
      });
      expect(new URL(body.qrCodeUrl).searchParams.get('addInfo')).toBe(
        order.code.replaceAll('-', ''),
      );
    });

    it('lists gateways with availability and currency support', async () => {
      const user = await t.account();
      const { body } = await get(
        user,
        '/api/v1/payments/methods?currency=USD',
      ).expect(200);
      const by = Object.fromEntries(
        body.map((m: { provider: string }) => [m.provider, m]),
      );
      expect(by.VIETQR).toMatchObject({
        available: true,
        supportsCurrency: false,
      });
      expect(by.MOMO).toMatchObject({ available: false });
      expect(by.STRIPE.supportsCurrency).toBe(true);
      await t.http().get('/payments/methods').expect(401);
    });
  });

  describe('GET /student/orders', () => {
    it('lists only my orders, newest first, with filter tabs and pagination', async () => {
      const user = await t.account();
      const other = await t.account();
      const [a, b, c] = [
        await paidCourse(100000, 'A'),
        await paidCourse(200000, 'B'),
        await paidCourse(300000, 'C'),
      ];
      const done = (await buy(user, [a.id]).expect(201)).body;
      const waiting = (await buy(user, [b.id, c.id]).expect(201)).body;
      const cancelled = (await buy(user, [c.id]).expect(201)).body;
      await buy(other, [a.id]).expect(201);
      const txId = `FT-${uid()}`;
      await pay(done.code, 100000, txId).expect(200);
      await t.db.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1`, [
        cancelled.orderId,
      ]);

      const all = (await get(user, '/api/v1/student/orders').expect(200)).body;
      expect(all).toMatchObject({
        total: 3,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(all.data.map((o: { code: string }) => o.code)).toEqual([
        cancelled.code,
        waiting.code,
        done.code,
      ]);
      const byCode = Object.fromEntries(
        all.data.map((o: { code: string }) => [o.code, o]),
      );
      expect(byCode[done.code]).toMatchObject({
        status: 'COMPLETED',
        canResume: false,
        providerTransactionId: txId,
        finalTotal: 100000,
        items: [{ courseTitleSnapshot: 'A', courseSlug: a.slug }],
      });
      expect(byCode[waiting.code]).toMatchObject({
        status: 'PENDING',
        canResume: true,
        finalTotal: 500000,
      });
      expect(
        byCode[waiting.code].items.map(
          (i: { courseTitleSnapshot: string }) => i.courseTitleSnapshot,
        ),
      ).toEqual(['B', 'C']);

      const statusOf = async (filter: string) =>
        (
          await get(user, `/student/orders?status=${filter}`).expect(200)
        ).body.data.map((o: { code: string }) => o.code);
      expect(await statusOf('pending')).toEqual([waiting.code]);
      expect(await statusOf('completed')).toEqual([done.code]);
      expect(await statusOf('cancelled')).toEqual([cancelled.code]);

      const page2 = (
        await get(user, '/student/orders?limit=2&page=2').expect(200)
      ).body;
      expect(page2).toMatchObject({
        total: 3,
        page: 2,
        limit: 2,
        totalPages: 2,
      });
      expect(page2.data.map((o: { code: string }) => o.code)).toEqual([
        done.code,
      ]);
    });

    it('treats an unpaid order past its expiry as not resumable', async () => {
      const user = await t.account();
      const course = await paidCourse();
      const order = (await buy(user, [course.id]).expect(201)).body;
      await t.db.query(
        `UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id=$1`,
        [order.orderId],
      );
      const { body } = await get(user, '/student/orders').expect(200);
      expect(body.data[0]).toMatchObject({
        status: 'PENDING',
        canResume: false,
      });
    });

    it('is empty for a new student and rejects bad queries', async () => {
      const user = await t.account();
      await get(user, '/student/orders')
        .expect(200)
        .expect({ data: [], total: 0, page: 1, limit: 10, totalPages: 1 });
      for (const bad of [
        'status=paid',
        'page=0',
        'page=abc',
        'limit=1000',
        'extra=1',
      ])
        await get(user, `/student/orders?${bad}`).expect(400);
      await t.http().get('/student/orders').expect(401);
    });
  });

  describe('POST /enrollments/free', () => {
    it('enrolls into a FREE course immediately and is not repeatable', async () => {
      const course = await t.course(owner, 1);
      const user = await t.account();
      const enroll = (prefix = '') =>
        t
          .http()
          .post(`${prefix}/enrollments/free`)
          .set('Origin', origin())
          .set('Cookie', user.session)
          .send({ courseId: course.id });
      await enroll('/api/v1')
        .expect(201)
        .expect(({ body }) =>
          expect(body.message).toBe('Enrolled successfully'),
        );
      await enroll().expect(409);
      expect(
        (
          await t.db.query(
            'SELECT 1 FROM enrollments WHERE user_id=$1 AND course_id=$2',
            [user.id, course.id],
          )
        ).length,
      ).toBe(1);
      expect(
        (await t.db.query('SELECT 1 FROM orders WHERE user_id=$1', [user.id]))
          .length,
      ).toBe(0);
    });

    it('sends PAID courses to checkout and validates input and origin', async () => {
      const paid = await paidCourse();
      const user = await t.account();
      const post = (body: object, withOrigin = true) =>
        t
          .http()
          .post('/api/v1/enrollments/free')
          .set('Cookie', user.session)
          .set(withOrigin ? { Origin: origin() } : {})
          .send(body);
      await post({ courseId: paid.id })
        .expect(402)
        .expect(({ body }) => {
          expect(body.code).toBe('PAYMENT_REQUIRED');
          expect(body.checkout.body).toEqual({ courseIds: [paid.id] });
        });
      await post({ courseId: paid.id }, false).expect(403);
      await post({ courseId: 'nope' }).expect(400);
      await post({ courseId: randomUUID() }).expect(404);
      await post({}).expect(400);
    });
  });

  describe('public course detail', () => {
    it('exposes price and access type for the CTA', async () => {
      const paid = await paidCourse(499000);
      const free = await t.course(owner, 1);
      const [{ slug: freeSlug }] = await t.db.query(
        'SELECT slug FROM courses WHERE id=$1',
        [free.id],
      );
      const a = (await t.http().get(`/public/courses/${paid.slug}`).expect(200))
        .body.course;
      expect(a).toMatchObject({
        accessType: 'PAID',
        price: 499000,
        currency: 'VND',
      });
      const b = (await t.http().get(`/public/courses/${freeSlug}`).expect(200))
        .body.course;
      expect(b).toMatchObject({ accessType: 'FREE', price: 0 });
    });
  });
});
