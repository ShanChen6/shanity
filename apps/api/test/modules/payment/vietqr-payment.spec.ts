import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { learningApp, type Account } from '../../support/learning-fixture.js';

describe('PAY1 VietQR payment engine', () => {
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
    await t.db.query('UPDATE courses SET price = 250000 WHERE id = $1', [
      courseId,
    ]);
  });

  afterAll(async () => {
    await t?.app.close();
    delete process.env.BANK_WEBHOOK_API_KEY;
  });

  const createOrder = () =>
    t.http().post('/orders').set('Cookie', student.session).send({ courseId });
  const webhook = (body: object, key = apiKey) =>
    t.http().post('/payments/webhook/vietqr').set('x-api-key', key).send(body);

  it('creates a dynamic QR, completes only from a valid webhook, and enrolls', async () => {
    const created = await createOrder().expect(201);
    expect(created.body).toMatchObject({
      amount: 250000,
      code: expect.stringMatching(/^SHAN[A-Z0-9]{6}$/),
    });
    const qr = new URL(created.body.qrCodeUrl);
    expect(qr.hostname).toBe('img.vietqr.io');
    expect(qr.searchParams.get('amount')).toBe('250000');
    expect(qr.searchParams.get('addInfo')).toBe(created.body.code);

    await webhook({
      transactionId: `FT-${randomUUID()}`,
      amount: 250000,
      transferContent: `PAY ${created.body.code}`,
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

  it('keeps a partial payment out of COMPLETED and grants no access', async () => {
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
    expect(status.body.status).toBe('PROCESSING');
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
