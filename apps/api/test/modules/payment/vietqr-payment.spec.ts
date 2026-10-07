import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { learningApp, type Account } from '../../support/learning-fixture.js';

describe('VietQR payment engine (PAY1, PAY3-5 order model)', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let student: Account;
  let courseId: string;
  const apiKey = `bank-${randomUUID()}`;

  beforeAll(async () => {
    process.env.BANK_WEBHOOK_API_KEY = apiKey;
    process.env.VIETQR_BANK_ID = '970422';
    process.env.VIETQR_ACCOUNT_NO = '123456789';
    process.env.VIETQR_ACCOUNT_NAME = 'SHANITY';
    t = await learningApp('vietqr-payment');
    const owner = await t.account('instructor');
    student = await t.account();
    const course = await t.course(owner, 1);
    courseId = course.id;
    await t.db.query(
      `UPDATE courses SET access_type = 'PAID', price = 250000 WHERE id = $1`,
      [courseId],
    );
  });

  afterAll(async () => {
    await t?.app.close();
    delete process.env.BANK_WEBHOOK_API_KEY;
  });

  const createOrder = () =>
    t
      .http()
      .post('/orders')
      .set('Origin', process.env.WEB_ORIGIN!)
      .set('Cookie', student.session)
      .send({ courseIds: [courseId] });
  const webhook = (body: object, key = apiKey) =>
    t.http().post('/payments/webhook/vietqr').set('x-api-key', key).send(body);

  it('creates a dynamic QR, completes only from a valid webhook, and enrolls', async () => {
    const created = await createOrder().expect(201);
    expect(created.body).toMatchObject({
      subtotal: 250000,
      discountTotal: 0,
      finalTotal: 250000,
      currency: 'VND',
      status: 'PENDING',
      code: expect.stringMatching(/^SHAN-\d{8}-[A-Z0-9]{4}$/),
      items: [
        {
          courseId,
          courseTitleSnapshot: 'Edge cases',
          unitPriceSnapshot: 250000,
          discountSnapshot: 0,
          finalPriceSnapshot: 250000,
        },
      ],
    });
    // The order itself is gateway-neutral; the QR comes from checkout.
    expect(created.body.qrCodeUrl).toBeUndefined();
    const checkout = await t
      .http()
      .post(`/orders/${created.body.orderId}/checkout`)
      .set('Origin', process.env.WEB_ORIGIN!)
      .set('Cookie', student.session)
      .send({ provider: 'VIETQR' })
      .expect(201);
    expect(checkout.body).toMatchObject({
      provider: 'VIETQR',
      amount: 250000,
      currency: 'VND',
    });
    const qr = new URL(checkout.body.qrCodeUrl);
    expect(qr.hostname).toBe('img.vietqr.io');
    expect(qr.searchParams.get('amount')).toBe('250000');
    // Banks strip punctuation, so the memo is the code without dashes.
    expect(qr.searchParams.get('addInfo')).toBe(
      created.body.code.replaceAll('-', ''),
    );

    await webhook({
      transactionId: `FT-${randomUUID()}`,
      amount: 250000,
      transferContent: `PAY ${created.body.code.replaceAll('-', '')}`,
    })
      .expect(200)
      .expect({ status: 'COMPLETED' });
    await t
      .http()
      .get(`/orders/${created.body.orderId}/status`)
      .set('Cookie', student.session)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('COMPLETED'));
    const [{ count }] = await t.db.query(
      'SELECT count(*)::int AS count FROM enrollments WHERE user_id=$1 AND course_id=$2',
      [student.id, courseId],
    );
    expect(count).toBe(1);
  });

  it('is absolutely idempotent for five deliveries of one bank transaction', async () => {
    await t.db.query(
      'DELETE FROM enrollments WHERE user_id=$1 AND course_id=$2',
      [student.id, courseId],
    );
    const order = (await createOrder().expect(201)).body;
    const payload = {
      transactionId: `FT-${randomUUID()}`,
      amount: 250000,
      transferContent: order.code,
    };
    const responses = [];
    for (let index = 0; index < 5; index++)
      responses.push(await webhook(payload).expect(200));
    expect(responses[0]!.body.status).toBe('COMPLETED');
    expect(
      responses
        .slice(1)
        .every(({ body }) => body.status === 'ALREADY_PROCESSED'),
    ).toBe(true);
    const [{ enrollments }] = await t.db.query(
      'SELECT count(*)::int AS enrollments FROM enrollments WHERE user_id=$1 AND course_id=$2',
      [student.id, courseId],
    );
    const [{ payments }] = await t.db.query(
      'SELECT count(*)::int AS payments FROM payment_transactions WHERE provider_transaction_id=$1',
      [payload.transactionId],
    );
    expect({ enrollments, payments }).toEqual({ enrollments: 1, payments: 1 });
  });

  it('keeps a partial payment out of COMPLETED, grants no access and leaves the order payable', async () => {
    await t.db.query(
      'DELETE FROM enrollments WHERE user_id=$1 AND course_id=$2',
      [student.id, courseId],
    );
    const order = (await createOrder().expect(201)).body;
    await webhook({
      transactionId: `FT-${randomUUID()}`,
      amount: 249999,
      transferContent: order.code,
    })
      .expect(200)
      .expect({ status: 'PARTIAL_AMOUNT' });
    const status = await t
      .http()
      .get(`/orders/${order.orderId}/status`)
      .set('Cookie', student.session)
      .expect(200);
    // A short payment is booked as evidence but must not freeze the order.
    expect(status.body.status).toBe('PENDING');
    const [{ count }] = await t.db.query(
      'SELECT count(*)::int AS count FROM enrollments WHERE user_id=$1 AND course_id=$2',
      [student.id, courseId],
    );
    expect(count).toBe(0);
  });

  it('rejects forged completion and unauthenticated webhooks', async () => {
    const order = (await createOrder().expect(201)).body;
    await t
      .http()
      .patch(`/orders/${order.orderId}`)
      .set('Cookie', student.session)
      .send({ status: 'COMPLETED' })
      .expect(404);
    await webhook(
      {
        transactionId: `FT-${randomUUID()}`,
        amount: 250000,
        transferContent: order.code,
      },
      'wrong',
    ).expect(401);
    const [{ status }] = await t.db.query(
      'SELECT status FROM orders WHERE id=$1',
      [order.orderId],
    );
    expect(status).toBe('PENDING');
  });
});
