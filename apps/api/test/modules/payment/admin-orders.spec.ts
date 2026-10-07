import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { AdminOrdersController } from '../../../src/modules/payment/admin/admin-orders.controller.js';
import { OrderAuditService } from '../../../src/modules/payment/order-audit.service.js';
import { PaymentService } from '../../../src/modules/payment/payment.service.js';
import {
  PAYMENT_HTTP_FETCH,
  type FetchLike,
} from '../../../src/modules/payment/providers/http-fetch.js';
import { learningApp, type Account } from '../../support/learning-fixture.js';

const uid = () => randomUUID().replaceAll('-', '').slice(0, 10);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * PAY17: admin order management, audited reconciliation and the immutable
 * audit trail. Proves that an order's status can only move through the
 * reconcile / refund workflows (or a verified payment), and that every move
 * leaves an audit row.
 */
describe(
  'PAY17 admin orders, reconciliation and audit trail',
  {
    timeout: 60_000,
  },
  () => {
    let t: Awaited<ReturnType<typeof learningApp>>;
    let owner: Account;
    let admin: Account;
    let finance: Account;
    let stripeHttp: FetchLike;
    const stripeCalls: Array<{
      url: string;
      headers: Record<string, string>;
      form?: URLSearchParams;
    }> = [];
    const bankKey = `bank-${uid()}${uid()}${uid()}`;
    const origin = () => process.env.WEB_ORIGIN!;
    const API = '/api/v1/admin/orders';

    beforeAll(async () => {
      Object.assign(process.env, {
        BANK_WEBHOOK_API_KEY: bankKey,
        VIETQR_BANK_ID: 'MB',
        VIETQR_BANK_NAME: 'MB Bank',
        VIETQR_ACCOUNT_NO: '0123456789',
        VIETQR_ACCOUNT_NAME: 'SHANITY EDU',
        STRIPE_SECRET_KEY: 'sk_test_admin',
        STRIPE_WEBHOOK_SECRET: 'whsec_admin',
        PAYMENT_PROOF_STORAGE_DIR: `/tmp/shanity-proofs-${uid()}`,
      });
      stripeHttp = () => Promise.reject(new Error('unexpected Stripe call'));
      t = await learningApp('adm-ord', (builder) =>
        builder.overrideProvider(PAYMENT_HTTP_FETCH).useValue(((url, init) => {
          stripeCalls.push({
            url,
            headers: (init?.headers ?? {}) as Record<string, string>,
            form: init?.body instanceof URLSearchParams ? init.body : undefined,
          });
          return stripeHttp(url, init);
        }) satisfies FetchLike),
      );
      owner = await t.account('instructor');
      admin = await t.account('admin');
      finance = await t.account('finance_officer');
    });
    afterAll(async () => {
      await t?.app.close();
      for (const key of [
        'BANK_WEBHOOK_API_KEY',
        'STRIPE_SECRET_KEY',
        'STRIPE_WEBHOOK_SECRET',
        'PAYMENT_PROOF_STORAGE_DIR',
      ])
        delete process.env[key];
    });

    // ------------------------------------------------------------- helpers
    async function paidCourse(price = 499000, title = 'Khóa học A') {
      const course = await t.course(owner, 1);
      await t.send('patch', `/courses/${course.id}`, owner.session, { title });
      await t
        .send('patch', `/courses/${course.id}/pricing`, owner.session, {
          accessType: 'PAID',
          price,
        })
        .expect(200);
      return course.id;
    }
    const buy = async (student: Account, courseIds: string[]) =>
      (
        await t
          .http()
          .post('/orders')
          .set('Origin', origin())
          .set('Cookie', student.session)
          .send({ courseIds })
          .expect(201)
      ).body as { orderId: string; code: string; finalTotal: number };
    /** A student with one unpaid order. */
    async function pendingOrder(price = 499000, title = 'Khóa học A') {
      const courseId = await paidCourse(price, title);
      const student = await t.account();
      const order = await buy(student, [courseId]);
      return { courseId, student, ...order };
    }
    const payViaWebhook = (code: string, amount: number, id = `FT-${uid()}`) =>
      t
        .http()
        .post('/payments/webhook/vietqr')
        .set('x-api-key', bankKey)
        .send({
          transactionId: id,
          amount,
          transferContent: code.replaceAll('-', ''),
        })
        .expect(200);
    /** A student with a COMPLETED (paid by webhook) order. */
    async function paidOrder(price = 499000) {
      const o = await pendingOrder(price);
      await payViaWebhook(o.code, price);
      return o;
    }
    const get = (account: Account, path: string) =>
      t.http().get(path).set('Cookie', account.session);
    const post = (account: Account, path: string, body: object = {}) =>
      t.send('post', path, account.session, body);
    const reconcileBody = (overrides: object = {}) => ({
      providerTransactionId: `FT${uid()}`,
      amountReceived: 499000,
      provider: 'VIETQR',
      note: 'Học viên chuyển khoản nhưng webhook ngân hàng bị mất',
      ...overrides,
    });
    const audit = (orderId: string, action?: string) =>
      t.db.query(
        `SELECT * FROM order_audit_logs WHERE order_id = $1
        ${action ? 'AND action = $2' : ''} ORDER BY created_at, id`,
        action ? [orderId, action] : [orderId],
      );
    const orderRow = async (orderId: string) =>
      (
        await t.db.query(
          'SELECT status, completed_at FROM orders WHERE id=$1',
          [orderId],
        )
      )[0] as { status: string; completed_at: Date | null };
    const ledger = (orderId: string) =>
      t.db.query(
        `SELECT provider, status, amount::int AS amount, provider_transaction_id
         FROM payment_transactions WHERE order_id=$1 ORDER BY created_at, id`,
        [orderId],
      );
    const enrollment = async (userId: string, courseId: string) =>
      (
        await t.db.query(
          'SELECT revoked_at FROM enrollments WHERE user_id=$1 AND course_id=$2',
          [userId, courseId],
        )
      )[0] as { revoked_at: Date | null } | undefined;
    /** SQL the way an attacker / careless script would run it. */
    const sqlFails = async (sql: string, params: unknown[] = []) => {
      const error = await t.db.query(sql, params).then(
        () => null,
        (e: unknown) => e as { code?: string; message: string },
      );
      expect(error, `expected "${sql}" to be rejected`).not.toBeNull();
      return error!;
    };

    // ==================================================================
    describe('invariant 1: no direct status override', () => {
      it('exposes no PATCH/PUT/DELETE order route and no "mark paid" shortcut', async () => {
        const o = await pendingOrder();
        const targets = [
          `${API}/${o.orderId}`,
          `${API}/${o.code}`,
          `${API}/${o.orderId}/status`,
        ];
        for (const path of targets) {
          for (const response of [
            await t.send('patch', path, admin.session, { status: 'COMPLETED' }),
            await t
              .http()
              .put(path)
              .set('Origin', origin())
              .set('Cookie', admin.session)
              .send({ status: 'PAID' }),
            await t.send('delete', path, admin.session),
          ])
            expect(response.status, path).toBe(404);
        }
        for (const action of ['complete', 'mark-paid', 'status', 'paid'])
          await post(admin, `${API}/${o.orderId}/${action}`, {
            status: 'COMPLETED',
          }).expect(404);
        // The student-facing order routes do not write status either.
        await t
          .send('patch', `/orders/${o.orderId}`, admin.session, {
            status: 'COMPLETED',
          })
          .expect(404);
        expect((await orderRow(o.orderId)).status).toBe('PENDING');
        expect(await ledger(o.orderId)).toEqual([]);
      });

      it('registers only GET and POST handlers under admin/orders, and no order PATCH/PUT/DELETE anywhere', () => {
        const modules = t.app.get(ModulesContainer);
        const routes: Array<{ method: RequestMethod; path: string }> = [];
        for (const module of modules.values())
          for (const wrapper of module.controllers.values()) {
            const controller = wrapper.metatype;
            if (!controller) continue;
            const base = ([] as string[]).concat(
              Reflect.getMetadata(PATH_METADATA, controller) ?? '',
            );
            for (const name of Object.getOwnPropertyNames(
              controller.prototype,
            )) {
              const handler = controller.prototype[name] as object;
              const method = Reflect.getMetadata(METHOD_METADATA, handler) as
                RequestMethod | undefined;
              if (method === undefined) continue;
              const path = Reflect.getMetadata(PATH_METADATA, handler) as
                string | string[];
              for (const prefix of base)
                for (const sub of ([] as string[]).concat(path))
                  routes.push({
                    method,
                    path: [prefix, sub.replace(/^\/+/, '')]
                      .filter(Boolean)
                      .join('/'),
                  });
            }
          }
        const orderRoutes = routes.filter((route) =>
          /(^|\/)orders(\/|$)/.test(route.path),
        );
        expect(orderRoutes.length).toBeGreaterThan(10);
        for (const route of orderRoutes)
          expect(
            [RequestMethod.PATCH, RequestMethod.PUT, RequestMethod.DELETE],
            route.path,
          ).not.toContain(route.method);

        const admin = routes
          .filter((route) => route.path.startsWith('admin/orders'))
          .map((route) => `${RequestMethod[route.method]} ${route.path}`)
          .sort();
        expect(admin).toEqual(
          [
            'GET admin/orders',
            'GET admin/orders/:id',
            'GET admin/orders/:id/proofs/:key',
            'POST admin/orders/:id/proofs',
            'POST admin/orders/:id/reconcile',
            'POST admin/orders/:id/refund',
          ].sort(),
        );
        // The controller is the one place that mutates, through the services.
        expect(
          Object.getOwnPropertyNames(AdminOrdersController.prototype).sort(),
        ).toEqual(
          [
            'constructor',
            'detail',
            'list',
            'proof',
            'reconcile',
            'refund',
            'uploadProof',
          ].sort(),
        );
      });

      it('PostgreSQL itself refuses to complete an order that no money backs', async () => {
        const o = await pendingOrder();
        const error = await sqlFails(
          `UPDATE orders SET status='COMPLETED' WHERE id=$1`,
          [o.orderId],
        );
        expect(error.code).toBe('23001');
        expect(error.message).toMatch(/cannot be COMPLETED/);
        // An under-payment does not count either.
        await t.db.query(
          `INSERT INTO payment_transactions(order_id, provider, provider_transaction_id,
           amount, currency, status, raw_payload)
         VALUES ($1,'VIETQR',$2,1000,'VND','SUCCESS','{}')`,
          [o.orderId, `FT-${uid()}`],
        );
        await sqlFails(`UPDATE orders SET status='COMPLETED' WHERE id=$1`, [
          o.orderId,
        ]);
        expect((await orderRow(o.orderId)).status).toBe('PENDING');
      });

      it('PostgreSQL refuses a manual payment or a refund row without its audit row', async () => {
        const o = await pendingOrder();
        await expect(
          t.db.transaction(async (tx) => {
            await tx.query(
              `INSERT INTO payment_transactions(order_id, provider, provider_transaction_id,
               amount, currency, status, raw_payload)
             VALUES ($1,'MANUAL_RECONCILED',$2,499000,'VND','SUCCESS','{}')`,
              [o.orderId, `FT-${uid()}`],
            );
            await tx.query(`UPDATE orders SET status='COMPLETED' WHERE id=$1`, [
              o.orderId,
            ]);
          }),
        ).rejects.toMatchObject({ code: '23001' });
        expect((await orderRow(o.orderId)).status).toBe('PENDING');
        expect(await ledger(o.orderId)).toEqual([]);

        const paid = await paidOrder();
        await expect(
          t.db.query(
            `INSERT INTO payment_transactions(order_id, provider, provider_transaction_id,
             amount, currency, status, raw_payload)
           VALUES ($1,'VIETQR',$2,100,'VND','PARTIALLY_REFUNDED','{}')`,
            [paid.orderId, `RF-${uid()}`],
          ),
        ).rejects.toMatchObject({ code: '23001' });
      });

      it('a status change slipped in through SQL still leaves a SYSTEM audit row', async () => {
        const o = await pendingOrder();
        await t.db.query(`UPDATE orders SET status='CANCELLED' WHERE id=$1`, [
          o.orderId,
        ]);
        const rows = await audit(o.orderId, 'STATUS_CHANGED');
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          actor_type: 'SYSTEM',
          actor_id: null,
          previous_state: { status: 'PENDING' },
          new_state: { status: 'CANCELLED' },
        });
        expect(rows[0].reason).toMatch(/PENDING -> CANCELLED/);
      });
    });

    // ==================================================================
    describe('access control', () => {
      it('is closed to anonymous users, students and instructors; open to admin and finance officers', async () => {
        const o = await pendingOrder();
        const student = o.student;
        for (const path of [API, `${API}/${o.orderId}`])
          await t.http().get(path).expect(401);
        for (const who of [student, owner])
          for (const path of [API, `${API}/${o.orderId}`])
            await get(who, path).expect(403);
        await post(
          student,
          `${API}/${o.orderId}/reconcile`,
          reconcileBody(),
        ).expect(403);
        await post(owner, `${API}/${o.orderId}/refund`, {
          refundAmount: 1000,
          reason: 'x'.repeat(12),
          notifyStudent: false,
        }).expect(403);
        await get(admin, API).expect(200);
        await get(finance, API).expect(200);
        await get(admin, `/admin/orders/${o.orderId}`).expect(200);
        expect((await orderRow(o.orderId)).status).toBe('PENDING');
      });

      it('lets an admin grant the finance_officer role through user management', async () => {
        const clerk = await t.account();
        await get(clerk, API).expect(403);
        await t
          .send('patch', `/users/${clerk.id}/role`, admin.session, {
            role: 'FINANCE_OFFICER',
          })
          .expect(200);
        // Roles are read per request: no re-login needed.
        await get(clerk, API).expect(200);
        // ...but it opens nothing else of the admin area.
        await get(clerk, '/users').expect(403);
      });

      it('rejects state-changing calls from another origin', async () => {
        const o = await pendingOrder();
        await t
          .http()
          .post(`${API}/${o.orderId}/reconcile`)
          .set('Origin', 'https://evil.example')
          .set('Cookie', admin.session)
          .send(reconcileBody())
          .expect(403);
        expect((await orderRow(o.orderId)).status).toBe('PENDING');
      });
    });

    // ==================================================================
    describe('POST /admin/orders/:id/reconcile', () => {
      it('books a MANUAL_RECONCILED payment, audits it, completes the order and grants access', async () => {
        const o = await pendingOrder(499000, 'Khóa học Z');
        const body = reconcileBody({ providerTransactionId: `FT${uid()}` });
        const response = await t
          .http()
          .post(`${API}/${o.orderId}/reconcile`)
          .set('Origin', origin())
          .set('Cookie', admin.session)
          .set('User-Agent', 'vitest-admin/1.0')
          .send(body)
          .expect(201);

        // 1. order + access
        expect(await orderRow(o.orderId)).toMatchObject({
          status: 'COMPLETED',
        });
        expect((await orderRow(o.orderId)).completed_at).toBeInstanceOf(Date);
        expect(await enrollment(o.student.id, o.courseId)).toEqual({
          revoked_at: null,
        });
        expect(response.body.enrollmentGranted).toBe(true);

        // 2. ledger: SUCCESS row of provider MANUAL_RECONCILED
        expect(await ledger(o.orderId)).toEqual([
          {
            provider: 'MANUAL_RECONCILED',
            status: 'SUCCESS',
            amount: 499000,
            provider_transaction_id: body.providerTransactionId,
          },
        ]);

        // 3. audit row: who, from where, why, before/after
        const [log] = await audit(o.orderId, 'MANUAL_RECONCILED');
        expect(log).toMatchObject({
          actor_type: 'ADMIN',
          actor_id: admin.id,
          actor_email: admin.email,
          reason: body.note,
          user_agent: 'vitest-admin/1.0',
          previous_state: { status: 'PENDING', paidTotal: 0 },
          new_state: {
            status: 'COMPLETED',
            providerTransactionId: body.providerTransactionId,
            declaredProvider: 'VIETQR',
            amountReceived: 499000,
            overpaidBy: 0,
            proofImageUrl: null,
          },
        });
        expect(log.ip_address).toMatch(/^adm-ord-/);

        // 4. the response is the fresh detail with the lifecycle timeline
        const detail = response.body.order;
        expect(detail).toMatchObject({
          code: o.code,
          status: 'COMPLETED',
          actions: { canReconcile: false, canRefund: true },
          provider: 'MANUAL_RECONCILED',
          summary: {
            paidAmount: 499000,
            refundedAmount: 0,
            finalTotal: 499000,
          },
          items: [{ title: 'Khóa học Z', enrollment: 'ACTIVE' }],
        });
        const types = detail.timeline.map(
          (event: { type: string }) => event.type,
        );
        expect(types).toEqual([
          'ORDER_CREATED',
          'MANUAL_RECONCILED',
          'ORDER_COMPLETED',
          'ENROLLMENT_GRANTED',
        ]);
        const manual = detail.timeline.find(
          (event: { type: string }) => event.type === 'MANUAL_RECONCILED',
        );
        expect(manual).toMatchObject({
          providerTransactionId: body.providerTransactionId,
          actorEmail: admin.email,
          note: body.note,
        });
      });

      it('reinstates an EXPIRED order the student actually paid', async () => {
        const o = await pendingOrder();
        await t.db.query(
          `UPDATE orders SET status='EXPIRED', expires_at = now() - interval '3 days' WHERE id=$1`,
          [o.orderId],
        );
        await post(
          finance,
          `${API}/${o.code}/reconcile`,
          reconcileBody({ amountReceived: 500000 }),
        ).expect(201);
        expect((await orderRow(o.orderId)).status).toBe('COMPLETED');
        const [log] = await audit(o.orderId, 'MANUAL_RECONCILED');
        expect(log).toMatchObject({
          actor_id: finance.id,
          previous_state: { status: 'EXPIRED' },
          new_state: { overpaidBy: 1000, amountReceived: 500000 },
        });
        expect(await enrollment(o.student.id, o.courseId)).toBeDefined();
      });

      it.each(['COMPLETED', 'CANCELLED'])(
        'refuses a %s order and writes nothing',
        async (status) => {
          const o = await pendingOrder();
          if (status === 'COMPLETED') await payViaWebhook(o.code, 499000);
          else
            await t.db.query(
              `UPDATE orders SET status='CANCELLED' WHERE id=$1`,
              [o.orderId],
            );
          const before = {
            ledger: await ledger(o.orderId),
            audit: (await audit(o.orderId)).length,
          };
          const { body } = await post(
            admin,
            `${API}/${o.orderId}/reconcile`,
            reconcileBody(),
          ).expect(409);
          expect(body.message).toBe('ORDER_NOT_RECONCILABLE');
          expect(await ledger(o.orderId)).toEqual(before.ledger);
          expect((await audit(o.orderId)).length).toBe(before.audit);
        },
      );

      it('requires a real transaction id, a justification and the full amount', async () => {
        const o = await pendingOrder();
        const path = `${API}/${o.orderId}/reconcile`;
        for (const bad of [
          { providerTransactionId: undefined },
          { providerTransactionId: '' },
          { providerTransactionId: 'a b' },
          { providerTransactionId: "FT123'; DROP TABLE orders;--" },
          { note: undefined },
          { note: '   ' },
          { note: 'ngắn' },
          { amountReceived: 0 },
          { amountReceived: -5 },
          { amountReceived: 1.5 },
          { amountReceived: '499000abc' },
          { provider: 'MANUAL_RECONCILED' },
          { provider: 'PAYPAL' },
          { extraField: 'nope' },
        ])
          await post(admin, path, reconcileBody(bad)).expect(400);
        // below the order total
        expect(
          (
            await post(
              admin,
              path,
              reconcileBody({ amountReceived: 498999 }),
            ).expect(400)
          ).body.message,
        ).toBe('AMOUNT_BELOW_ORDER_TOTAL');
        await post(
          admin,
          `${API}/${randomUUID()}/reconcile`,
          reconcileBody(),
        ).expect(404);
        await post(
          admin,
          `${API}/not-an-order/reconcile`,
          reconcileBody(),
        ).expect(404);

        expect((await orderRow(o.orderId)).status).toBe('PENDING');
        expect(await ledger(o.orderId)).toEqual([]);
        expect(await audit(o.orderId, 'MANUAL_RECONCILED')).toEqual([]);
      });

      it('lets one bank transaction back one payment only', async () => {
        const a = await pendingOrder();
        const b = await pendingOrder();
        const c = await pendingOrder();
        const bank = `FT${uid()}`;
        await post(
          admin,
          `${API}/${a.orderId}/reconcile`,
          reconcileBody({ providerTransactionId: bank }),
        ).expect(201);
        expect(
          (
            await post(
              admin,
              `${API}/${b.orderId}/reconcile`,
              reconcileBody({ providerTransactionId: bank }),
            ).expect(409)
          ).body.message,
        ).toBe('PROVIDER_TRANSACTION_ALREADY_RECORDED');
        // ...also when the real webhook already settled that very transaction.
        const webhookId = `FT${uid()}`;
        await payViaWebhook(c.code, 499000, webhookId);
        const d = await pendingOrder();
        await post(
          admin,
          `${API}/${d.orderId}/reconcile`,
          reconcileBody({
            providerTransactionId: webhookId,
            provider: 'VIETQR',
          }),
        ).expect(409);
        expect((await orderRow(b.orderId)).status).toBe('PENDING');
        expect((await orderRow(d.orderId)).status).toBe('PENDING');
      });

      it('serialises two simultaneous reconciliations of the same order', async () => {
        const o = await pendingOrder();
        const responses = await Promise.all(
          [admin, finance].map((who) =>
            post(who, `${API}/${o.orderId}/reconcile`, reconcileBody()),
          ),
        );
        expect(responses.map((r) => r.status).sort((a, b) => a - b)).toEqual([
          201, 409,
        ]);
        expect(await ledger(o.orderId)).toHaveLength(1);
        expect(await audit(o.orderId, 'MANUAL_RECONCILED')).toHaveLength(1);
      });

      it('rolls everything back when the audit row cannot be written', async () => {
        const o = await pendingOrder();
        const service = t.app.get(OrderAuditService);
        const original = service.append.bind(service);
        const spy = vi
          .spyOn(service, 'append')
          .mockImplementation((manager, entry) => {
            if (entry.action === 'MANUAL_RECONCILED')
              return Promise.reject(new Error('audit store down'));
            return original(manager, entry);
          });
        try {
          await post(
            admin,
            `${API}/${o.orderId}/reconcile`,
            reconcileBody(),
          ).expect(500);
        } finally {
          spy.mockRestore();
        }
        expect((await orderRow(o.orderId)).status).toBe('PENDING');
        expect(await ledger(o.orderId)).toEqual([]);
        expect(await enrollment(o.student.id, o.courseId)).toBeUndefined();
      });

      it('a late bank webhook for the reconciled order cannot double-count', async () => {
        const o = await pendingOrder();
        const late = `FTLATE${uid()}`;
        await post(
          admin,
          `${API}/${o.orderId}/reconcile`,
          reconcileBody({ providerTransactionId: late }),
        ).expect(201);
        await payViaWebhook(o.code, 499000, late);
        const rows = await ledger(o.orderId);
        expect(
          rows.filter((r: { status: string }) => r.status === 'SUCCESS'),
        ).toHaveLength(1);
        expect((await orderRow(o.orderId)).status).toBe('COMPLETED');
      });
    });

    // ==================================================================
    describe('payment proofs', () => {
      const upload = (
        account: Account,
        orderRef: string,
        content: Buffer,
        name = 'proof.png',
        type = 'image/png',
      ) =>
        t
          .http()
          .post(`${API}/${orderRef}/proofs`)
          .set('Origin', origin())
          .set('Cookie', account.session)
          .attach('file', content, { filename: name, contentType: type });

      it('stores an uploaded proof privately, audits it, and accepts it on reconcile', async () => {
        const o = await pendingOrder();
        const { body } = await upload(admin, o.orderId, PNG).expect(201);
        expect(body).toMatchObject({
          contentType: 'image/png',
          proofImageUrl: `${API}/${o.orderId}/proofs/${body.proofKey}`,
        });
        const [uploaded] = await audit(o.orderId, 'PROOF_UPLOADED');
        expect(uploaded).toMatchObject({
          actor_id: admin.id,
          new_state: { proofKey: body.proofKey, contentType: 'image/png' },
        });

        // Private: no session -> 401, student -> 403, other order -> 404.
        await t.http().get(body.proofImageUrl).expect(401);
        await get(o.student, body.proofImageUrl).expect(403);
        const other = await pendingOrder();
        await get(
          admin,
          `${API}/${other.orderId}/proofs/${body.proofKey}`,
        ).expect(404);
        const served = await get(finance, body.proofImageUrl).expect(200);
        expect(served.headers['content-type']).toBe('image/png');
        expect(served.headers['x-content-type-options']).toBe('nosniff');
        expect(Buffer.compare(served.body as Buffer, PNG)).toBe(0);
        expect(
          (await audit(o.orderId, 'DETAIL_VIEWED')).some(
            (row: { new_state: { target: string } }) =>
              row.new_state.target === 'proof',
          ),
        ).toBe(true);

        await post(
          admin,
          `${API}/${o.orderId}/reconcile`,
          reconcileBody({ proofImageUrl: body.proofImageUrl }),
        ).expect(201);
        const [log] = await audit(o.orderId, 'MANUAL_RECONCILED');
        expect(log.new_state.proofImageUrl).toBe(body.proofImageUrl);
      });

      it('rejects non-image uploads, unknown proofs and unsafe links', async () => {
        const o = await pendingOrder();
        const other = await pendingOrder();
        await upload(
          admin,
          o.orderId,
          Buffer.from('<script>alert(1)</script>'),
          'x.png',
        ).expect(400);
        await upload(admin, o.orderId, Buffer.alloc(0)).expect(400);
        await upload(o.student, o.orderId, PNG).expect(403);
        await upload(admin, randomUUID(), PNG).expect(404);
        const foreign = (await upload(admin, other.orderId, PNG).expect(201))
          .body;
        for (const proofImageUrl of [
          foreign.proofImageUrl, // another order's file
          `${API}/${o.orderId}/proofs/${randomUUID()}.png`, // never uploaded
          'javascript:alert(1)',
          'http://insecure.example/proof.png',
          'data:text/html;base64,PHNjcmlwdD4=',
          '/etc/passwd',
        ])
          await post(
            admin,
            `${API}/${o.orderId}/reconcile`,
            reconcileBody({ proofImageUrl }),
          ).expect(400);
        await post(
          admin,
          `${API}/${o.orderId}/reconcile`,
          reconcileBody({
            proofImageUrl: 'https://files.example.com/slip.png',
          }),
        ).expect(201);
      });
    });

    // ==================================================================
    describe('POST /admin/orders/:id/refund', () => {
      const refundBody = (overrides: object = {}) => ({
        refundAmount: 100000,
        reason: 'Học viên yêu cầu hoàn tiền một phần theo chính sách',
        notifyStudent: true,
        ...overrides,
      });

      it('partial refund: ledger row + audit, access stays', async () => {
        const o = await paidOrder();
        const { body } = await post(
          admin,
          `${API}/${o.orderId}/refund`,
          refundBody(),
        ).expect(201);
        expect(body.refund).toMatchObject({
          amount: 100000,
          status: 'PARTIALLY_REFUNDED',
          mode: 'INTERNAL',
          enrollmentsRevoked: 0,
        });
        expect(body.order).toMatchObject({
          status: 'COMPLETED',
          summary: {
            paidAmount: 499000,
            refundedAmount: 100000,
            refundableAmount: 399000,
            refundStatus: 'PARTIALLY_REFUNDED',
          },
        });
        expect((await orderRow(o.orderId)).status).toBe('COMPLETED');
        expect(await enrollment(o.student.id, o.courseId)).toEqual({
          revoked_at: null,
        });
        const rows = await ledger(o.orderId);
        expect(rows.at(-1)).toMatchObject({
          status: 'PARTIALLY_REFUNDED',
          amount: 100000,
        });
        const [log] = await audit(o.orderId, 'REFUND_ISSUED');
        expect(log).toMatchObject({
          actor_id: admin.id,
          reason: refundBody().reason,
          previous_state: {
            status: 'COMPLETED',
            paidTotal: 499000,
            refundedTotal: 0,
          },
          new_state: {
            status: 'COMPLETED',
            refundStatus: 'PARTIALLY_REFUNDED',
            refundAmount: 100000,
            refundedTotal: 100000,
            mode: 'INTERNAL',
            notifyStudent: true,
          },
        });
        expect(await audit(o.orderId, 'ENROLLMENT_REVOKED')).toEqual([]);
      });

      it('full refund: REFUNDED, access revoked and both steps audited; later refunds refused', async () => {
        const o = await paidOrder();
        await post(
          admin,
          `${API}/${o.orderId}/refund`,
          refundBody({ refundAmount: 99000 }),
        ).expect(201);
        const { body } = await post(
          finance,
          `${API}/${o.orderId}/refund`,
          refundBody({ refundAmount: 400000, notifyStudent: false }),
        ).expect(201);
        expect(body.refund).toMatchObject({
          status: 'REFUNDED',
          enrollmentsRevoked: 1,
        });
        expect(body.order).toMatchObject({
          status: 'REFUNDED',
          actions: { canRefund: false, canReconcile: false },
          items: [{ enrollment: 'REVOKED' }],
          summary: { refundStatus: 'REFUNDED', refundableAmount: 0 },
        });
        expect(
          (await enrollment(o.student.id, o.courseId))?.revoked_at,
        ).toBeInstanceOf(Date);
        expect((await orderRow(o.orderId)).completed_at).not.toBeNull();

        const refunds = await audit(o.orderId, 'REFUND_ISSUED');
        expect(refunds.map((r: { actor_id: string }) => r.actor_id)).toEqual([
          admin.id,
          finance.id,
        ]);
        expect(refunds[1].new_state).toMatchObject({
          status: 'REFUNDED',
          refundStatus: 'REFUNDED',
        });
        const [revoked] = await audit(o.orderId, 'ENROLLMENT_REVOKED');
        expect(revoked).toMatchObject({
          actor_id: finance.id,
          new_state: { enrollment: 'REVOKED', courseIds: [o.courseId] },
        });
        const types = body.order.timeline.map((e: { type: string }) => e.type);
        expect(types).toContain('REFUND_ISSUED');
        expect(types).toContain('ENROLLMENT_REVOKED');

        await post(
          admin,
          `${API}/${o.orderId}/refund`,
          refundBody({ refundAmount: 1000 }),
        ).expect(409);
        // and it cannot be re-reconciled back to COMPLETED
        await post(
          admin,
          `${API}/${o.orderId}/reconcile`,
          reconcileBody(),
        ).expect(409);
      });

      it('refuses over-refunds, unpaid orders and malformed requests without writing', async () => {
        const paid = await paidOrder();
        const unpaid = await pendingOrder();
        const before = (await audit(paid.orderId)).length;
        expect(
          (
            await post(
              admin,
              `${API}/${paid.orderId}/refund`,
              refundBody({ refundAmount: 499001 }),
            ).expect(400)
          ).body.message,
        ).toBe('REFUND_EXCEEDS_REFUNDABLE');
        expect(
          (
            await post(
              admin,
              `${API}/${unpaid.orderId}/refund`,
              refundBody(),
            ).expect(409)
          ).body.message,
        ).toBe('ORDER_NOT_REFUNDABLE');
        for (const bad of [
          { refundAmount: 0 },
          { refundAmount: -1 },
          { refundAmount: 10.5 },
          { reason: undefined },
          { reason: '   ' },
          { reason: 'ngắn' },
          { notifyStudent: undefined },
          { notifyStudent: 'yes' },
        ])
          await post(
            admin,
            `${API}/${paid.orderId}/refund`,
            refundBody(bad),
          ).expect(400);
        expect((await audit(paid.orderId)).length).toBe(before);
        expect(
          (await ledger(paid.orderId)).filter(
            (r: { status: string }) => r.status !== 'SUCCESS',
          ),
        ).toEqual([]);
      });

      it('serialises concurrent refunds so the total never exceeds what was paid', async () => {
        const o = await paidOrder();
        const responses = await Promise.all(
          Array.from({ length: 4 }, (_, i) =>
            post(
              i % 2 ? admin : finance,
              `${API}/${o.orderId}/refund`,
              refundBody({ refundAmount: 200000 }),
            ),
          ),
        );
        const ok = responses.filter((r) => r.status === 201).length;
        expect(ok).toBe(2); // 2 x 200000 <= 499000 < 3 x 200000
        const refunded = (await ledger(o.orderId))
          .filter((r: { status: string }) => r.status !== 'SUCCESS')
          .reduce((sum: number, r: { amount: number }) => sum + r.amount, 0);
        expect(refunded).toBe(400000);
        expect(await audit(o.orderId, 'REFUND_ISSUED')).toHaveLength(2);
      });

      it('refunds through the gateway when it supports it (Stripe), idempotently keyed', async () => {
        const o = await pendingOrder(200000);
        const stripeSession = `cs_test_${uid()}`;
        const stripeRefund = `re_test_${uid()}`;
        // Money arrived through Stripe: ledger row first, then the order.
        await t.db.query(
          `INSERT INTO payment_transactions(order_id, provider, provider_transaction_id,
           amount, currency, status, raw_payload)
         VALUES ($1,'STRIPE',$2,200000,'VND','SUCCESS','{}')`,
          [o.orderId, stripeSession],
        );
        await t.db.query(`UPDATE orders SET status='COMPLETED' WHERE id=$1`, [
          o.orderId,
        ]);
        stripeCalls.length = 0;
        stripeHttp = (url) =>
          Promise.resolve(
            url.includes('/v1/refunds')
              ? json({ id: stripeRefund, status: 'succeeded' })
              : json({
                  id: stripeSession,
                  client_reference_id: o.code,
                  currency: 'vnd',
                  amount_total: 200000,
                  payment_status: 'paid',
                  payment_intent: 'pi_test_1',
                }),
          );
        const { body } = await post(
          admin,
          `${API}/${o.orderId}/refund`,
          refundBody({ refundAmount: 50000 }),
        ).expect(201);
        expect(body.refund).toMatchObject({
          mode: 'PROVIDER_API',
          providerTransactionId: stripeRefund,
          status: 'PARTIALLY_REFUNDED',
        });
        const refundCall = stripeCalls.find((c) =>
          c.url.endsWith('/v1/refunds'),
        )!;
        expect(Object.fromEntries(refundCall.form!)).toMatchObject({
          payment_intent: 'pi_test_1',
          amount: '50000',
        });
        expect(refundCall.headers['Idempotency-Key']).toMatch(/^[0-9a-f]{64}$/);
        const [log] = await audit(o.orderId, 'REFUND_ISSUED');
        expect(log.new_state).toMatchObject({
          mode: 'PROVIDER_API',
          providerTransactionId: stripeRefund,
          provider: 'STRIPE',
        });
      });

      it('records nothing when the gateway refuses the refund', async () => {
        const o = await pendingOrder(200000);
        await t.db.query(
          `INSERT INTO payment_transactions(order_id, provider, provider_transaction_id,
           amount, currency, status, raw_payload)
         VALUES ($1,'STRIPE',$2,200000,'VND','SUCCESS','{}')`,
          [o.orderId, `cs_test_${uid()}`],
        );
        await t.db.query(`UPDATE orders SET status='COMPLETED' WHERE id=$1`, [
          o.orderId,
        ]);
        stripeHttp = () =>
          Promise.resolve(json({ error: { type: 'api_error' } }, 500));
        await post(
          admin,
          `${API}/${o.orderId}/refund`,
          refundBody({ refundAmount: 50000 }),
        ).expect(502);
        expect(await audit(o.orderId, 'REFUND_ISSUED')).toEqual([]);
        expect(
          (await ledger(o.orderId)).map((r: { status: string }) => r.status),
        ).toEqual(['SUCCESS']);
      });
    });

    // ==================================================================
    describe('invariant 3: immutable audit trail', () => {
      it('is append-only: UPDATE, DELETE and TRUNCATE are rejected', async () => {
        const o = await pendingOrder();
        await post(
          admin,
          `${API}/${o.orderId}/reconcile`,
          reconcileBody(),
        ).expect(201);
        const [log] = await audit(o.orderId, 'MANUAL_RECONCILED');
        for (const sql of [
          `UPDATE order_audit_logs SET reason = 'edited' WHERE id = $1`,
          `UPDATE order_audit_logs SET actor_email = 'someone@else' WHERE id = $1`,
          `DELETE FROM order_audit_logs WHERE id = $1`,
          `DELETE FROM order_audit_logs WHERE order_id = (SELECT order_id FROM order_audit_logs WHERE id = $1)`,
        ])
          expect((await sqlFails(sql, [log.id])).code).toBe('23001');
        expect((await sqlFails('TRUNCATE order_audit_logs')).code).toBe(
          '23001',
        );
        expect(
          (await sqlFails('DELETE FROM orders WHERE id = $1', [o.orderId]))
            .code,
        ).toBe('23001');
        expect((await audit(o.orderId, 'MANUAL_RECONCILED'))[0]).toEqual(log);
      });

      it('cannot hold an anonymous, reasonless or IP-less admin entry', async () => {
        const o = await pendingOrder();
        const insert = (overrides: Record<string, unknown>) => {
          const row = {
            actor_type: 'ADMIN',
            actor_id: admin.id,
            actor_email: admin.email,
            reason: 'because',
            ip_address: '10.0.0.1',
            ...overrides,
          };
          return t.db.query(
            `INSERT INTO order_audit_logs(order_id, actor_type, actor_id, actor_email, action, reason, ip_address)
           VALUES ($1,$2,$3,$4,'NOTE_ADDED',$5,$6)`,
            [
              o.orderId,
              row.actor_type,
              row.actor_id,
              row.actor_email,
              row.reason,
              row.ip_address,
            ],
          );
        };
        await insert({}); // a complete entry is fine
        for (const bad of [
          { reason: null },
          { reason: '' },
          { reason: '   ' },
          { ip_address: null },
          { actor_id: null },
          { actor_type: 'SYSTEM' }, // SYSTEM must not carry a user id
        ])
          await expect(insert(bad), JSON.stringify(bad)).rejects.toMatchObject({
            code: expect.stringMatching(/^23/),
          });
      });

      it('records the order lifecycle: CREATED (buyer), system expiry, verified payment', async () => {
        const o = await pendingOrder();
        const [created] = await audit(o.orderId, 'CREATED');
        expect(created).toMatchObject({
          actor_type: 'STUDENT',
          actor_id: o.student.id,
          actor_email: o.student.email,
          new_state: { status: 'PENDING', finalTotal: 499000, code: o.code },
        });

        await t.db.query(
          `UPDATE orders SET expires_at = now() - interval '1 minute' WHERE id=$1`,
          [o.orderId],
        );
        await t.app.get(PaymentService).expirePendingOrders();
        const [expired] = await audit(o.orderId, 'STATUS_CHANGED');
        expect(expired).toMatchObject({
          actor_type: 'SYSTEM',
          new_state: { status: 'EXPIRED' },
        });

        const paid = await pendingOrder();
        const settleId = `FTSETTLE${uid()}`;
        await payViaWebhook(paid.code, 499000, settleId);
        const [completed] = await audit(paid.orderId, 'STATUS_CHANGED');
        expect(completed).toMatchObject({
          actor_type: 'SYSTEM',
          new_state: {
            status: 'COMPLETED',
            provider: 'VIETQR',
            providerTransactionId: settleId,
          },
        });
        expect(completed.reason).toMatch(/Payment confirmed by VIETQR/);
      });

      it('audits every detail view (and not the list), exposing it on the detail itself', async () => {
        const o = await pendingOrder();
        await get(admin, API).expect(200);
        expect(await audit(o.orderId, 'DETAIL_VIEWED')).toEqual([]);

        const { body } = await t
          .http()
          .get(`${API}/${o.orderId}`)
          .set('Cookie', admin.session)
          .set('User-Agent', 'vitest-viewer')
          .expect(200);
        const [view] = await audit(o.orderId, 'DETAIL_VIEWED');
        expect(view).toMatchObject({
          actor_type: 'ADMIN',
          actor_id: admin.id,
          actor_email: admin.email,
          user_agent: 'vitest-viewer',
          new_state: { target: 'order' },
        });
        expect(view.ip_address).toMatch(/^adm-ord-/);
        expect(view.reason).toBeTruthy();
        // the viewer sees their own entry
        expect(body.auditLogs[0]).toMatchObject({
          id: view.id,
          action: 'DETAIL_VIEWED',
          actorId: admin.id,
        });
        expect(body.auditLogs.at(-1)).toMatchObject({
          action: 'CREATED',
          actorId: o.student.id,
        });
        // the legacy per-order endpoint is audited as well
        await get(admin, `/api/v1/orders/${o.code}`).expect(200);
        expect(await audit(o.orderId, 'DETAIL_VIEWED')).toHaveLength(2);
        // students reading their own order are not "admin views"
        await get(o.student, `/api/v1/orders/${o.code}`).expect(200);
        expect(await audit(o.orderId, 'DETAIL_VIEWED')).toHaveLength(2);
      });
    });

    // ==================================================================
    describe('GET /admin/orders (search, filter, sort, paginate)', () => {
      it('returns the table columns from the frozen snapshot', async () => {
        const o = await pendingOrder(750000, 'Tiêu đề gốc');
        await t.send('patch', `/courses/${o.courseId}`, owner.session, {
          title: 'Đổi tên sau',
        });
        const { body } = await get(admin, `${API}?q=${o.code}`).expect(200);
        expect(body).toMatchObject({
          page: 1,
          limit: 20,
          total: 1,
          totalPages: 1,
        });
        expect(body.items[0]).toMatchObject({
          id: o.orderId,
          code: o.code,
          status: 'PENDING',
          student: { id: o.student.id, email: o.student.email },
          courses: [{ title: 'Tiêu đề gốc', finalPrice: 750000 }],
          currency: 'VND',
          finalTotal: 750000,
          paidAmount: 0,
          provider: null,
          completedAt: null,
        });
        // search by the title the student bought, not the renamed course
        const byTitle = await get(
          admin,
          `${API}?q=${encodeURIComponent('Tiêu đề gốc')}`,
        ).expect(200);
        expect(byTitle.body.items.map((i: { id: string }) => i.id)).toContain(
          o.orderId,
        );
        const renamed = await get(
          admin,
          `${API}?q=${encodeURIComponent('Đổi tên sau')}`,
        ).expect(200);
        expect(
          renamed.body.items.map((i: { id: string }) => i.id),
        ).not.toContain(o.orderId);
      });

      it('searches by code, student email/name and provider transaction id', async () => {
        const o = await pendingOrder();
        const bank = `FTSEARCH${uid()}`;
        await post(
          admin,
          `${API}/${o.orderId}/reconcile`,
          reconcileBody({ providerTransactionId: bank }),
        ).expect(201);
        const ids = async (q: string) =>
          (
            await get(admin, `${API}?q=${encodeURIComponent(q)}`).expect(200)
          ).body.items.map((i: { id: string }) => i.id);
        expect(await ids(o.code.toLowerCase())).toEqual([o.orderId]);
        expect(await ids(o.student.email.slice(0, 20))).toEqual([o.orderId]);
        expect(await ids(bank.toLowerCase())).toEqual([o.orderId]);
        const [{ display_name: name }] = await t.db.query(
          'SELECT display_name FROM users WHERE id=$1',
          [o.student.id],
        );
        expect(await ids(name)).toContain(o.orderId);
        expect(await ids('zzz-no-such-thing')).toEqual([]);
        for (const q of ['\\', "'; DROP TABLE orders;--", '"'])
          expect(await ids(q)).toEqual([]);
        // NUL cannot be stored by PostgreSQL: a clean 400, never a 500.
        await get(admin, `${API}?q=${encodeURIComponent('a\u0000b')}`).expect(
          400,
        );
      });

      it('treats LIKE metacharacters in the search box as plain text', async () => {
        const stamp = uid();
        const literal = await pendingOrder(120000, `Giảm ${stamp}%_off`);
        const decoy = await pendingOrder(120000, `Giảm ${stamp}xoff`);
        const ids = async (q: string) =>
          (
            await get(admin, `${API}?q=${encodeURIComponent(q)}`).expect(200)
          ).body.items.map((i: { id: string }) => i.id);
        expect(await ids(`${stamp}%_off`)).toEqual([literal.orderId]);
        // `_` and `%` would match the decoy if they were wildcards.
        expect(await ids(`${stamp}_off`)).toEqual([]);
        expect(await ids(`${stamp}%off`)).toEqual([]);
        expect(await ids(`${stamp}x`)).toEqual([decoy.orderId]);
      });

      it('filters by status, provider, date range and amount', async () => {
        const unique = 100_000 + Math.floor(Math.random() * 800_000) * 1;
        const pending = await pendingOrder(unique);
        const manual = await pendingOrder(unique + 1);
        const hook = await pendingOrder(unique + 2);
        await post(
          admin,
          `${API}/${manual.orderId}/reconcile`,
          reconcileBody({ amountReceived: unique + 1 }),
        ).expect(201);
        await payViaWebhook(hook.code, unique + 2);
        const ids = async (query = '') => {
          const params = new URLSearchParams({
            amountMin: String(unique),
            amountMax: String(unique + 2),
            limit: '100',
          });
          for (const [key, value] of new URLSearchParams(query))
            params.set(key, value);
          return (await get(admin, `${API}?${params}`).expect(200)).body.items
            .map((i: { id: string }) => i.id)
            .sort();
        };
        expect(await ids()).toEqual(
          [pending.orderId, manual.orderId, hook.orderId].sort(),
        );
        expect(await ids('status=PENDING')).toEqual([pending.orderId]);
        expect(await ids('status=COMPLETED')).toEqual(
          [manual.orderId, hook.orderId].sort(),
        );
        expect(await ids('provider=MANUAL_RECONCILED')).toEqual([
          manual.orderId,
        ]);
        expect(await ids('provider=VIETQR')).toEqual([hook.orderId]);
        expect(await ids(`amountMin=${unique + 2}`)).toEqual([hook.orderId]);

        const hour = 3_600_000;
        const from = new Date(Date.now() - hour).toISOString();
        const to = new Date(Date.now() + hour).toISOString();
        expect(await ids(`dateFrom=${from}&dateTo=${to}`)).toHaveLength(3);
        expect(await ids(`dateFrom=${to}`)).toEqual([]);
        expect(
          await ids(`dateField=completedAt&dateFrom=${from}&dateTo=${to}`),
        ).toEqual([manual.orderId, hook.orderId].sort());
        expect(
          await ids(
            `dateField=completedAt&dateTo=${new Date(Date.now() - hour).toISOString()}`,
          ),
        ).toEqual([]);
      });

      it('sorts (whitelisted keys) and paginates with totals', async () => {
        const base = 200_000 + Math.floor(Math.random() * 100_000) * 7;
        for (let i = 0; i < 5; i++) await pendingOrder(base + i);
        const page = (n: number, extra = '') =>
          get(
            admin,
            `${API}?amountMin=${base}&amountMax=${base + 4}&limit=2&page=${n}&${extra}`,
          ).expect(200);
        const first = (await page(1, 'sortBy=finalTotal&sortOrder=asc')).body;
        expect(first).toMatchObject({
          page: 1,
          limit: 2,
          total: 5,
          totalPages: 3,
        });
        expect(
          first.items.map((i: { finalTotal: number }) => i.finalTotal),
        ).toEqual([base, base + 1]);
        const last = (await page(3, 'sortBy=finalTotal&sortOrder=asc')).body;
        expect(
          last.items.map((i: { finalTotal: number }) => i.finalTotal),
        ).toEqual([base + 4]);
        const desc = (await page(1, 'sortBy=finalTotal&sortOrder=desc')).body;
        expect(desc.items[0].finalTotal).toBe(base + 4);
        for (const sortBy of [
          'createdAt',
          'completedAt',
          'code',
          'status',
          'studentName',
        ])
          await get(admin, `${API}?sortBy=${sortBy}&limit=3`).expect(200);
        expect((await page(99)).body.items).toEqual([]);
      });

      it('rejects malformed queries instead of passing them to SQL', async () => {
        for (const query of [
          'sortBy=password',
          'sortBy=created_at;DROP TABLE orders',
          'sortOrder=sideways',
          'status=PAID',
          'provider=PAYPAL',
          'page=0',
          'limit=1000',
          'limit=abc',
          'amountMin=-1',
          'amountMin=10&amountMax=5',
          'dateFrom=yesterday',
          'dateFrom=2026-12-31T00:00:00Z&dateTo=2026-01-01T00:00:00Z',
          'dateField=updatedAt',
          `q=${'x'.repeat(101)}`,
          'unknown=1',
        ])
          await get(admin, `${API}?${query}`).expect(400);
      });
    });

    // ==================================================================
    describe('GET /admin/orders/:id (detail, timeline)', () => {
      it('shows student, snapshots, summary, ledger and the webhook timeline', async () => {
        const o = await pendingOrder(499000, 'Khóa học X');
        const detailId = `FTDETAIL${uid()}`;
        await payViaWebhook(o.code, 499000, detailId);
        const { body } = await get(finance, `${API}/${o.code}`).expect(200);
        expect(body).toMatchObject({
          id: o.orderId,
          code: o.code,
          status: 'COMPLETED',
          student: { id: o.student.id, email: o.student.email },
          items: [
            {
              title: 'Khóa học X',
              unitPrice: 499000,
              discount: 0,
              finalPrice: 499000,
              currency: 'VND',
              enrollment: 'ACTIVE',
            },
          ],
          summary: {
            currency: 'VND',
            subtotal: 499000,
            discountTotal: 0,
            finalTotal: 499000,
            paidAmount: 499000,
            refundedAmount: 0,
          },
          provider: 'VIETQR',
          actions: { canReconcile: false, canRefund: true },
        });
        expect(body.transactions[0]).toMatchObject({
          provider: 'VIETQR',
          status: 'SUCCESS',
          providerTransactionId: detailId,
          amount: 499000,
        });
        const types = body.timeline.map((e: { type: string }) => e.type);
        expect(types).toEqual([
          'ORDER_CREATED',
          'WEBHOOK_RECEIVED',
          'ORDER_COMPLETED',
          'ENROLLMENT_GRANTED',
        ]);
        expect(body.timeline[1]).toMatchObject({
          provider: 'VIETQR',
          providerTransactionId: detailId,
          payload: expect.any(Object),
        });
        expect(body.auditLogs.map((l: { action: string }) => l.action)).toEqual(
          expect.arrayContaining([
            'DETAIL_VIEWED',
            'STATUS_CHANGED',
            'CREATED',
          ]),
        );
      });

      it('answers 404 for unknown or malformed references', async () => {
        for (const ref of [randomUUID(), 'SHAN-20990101-ZZZZ', 'nope', "x'--"])
          await get(admin, `${API}/${encodeURIComponent(ref)}`).expect(404);
      });
    });
  },
);
