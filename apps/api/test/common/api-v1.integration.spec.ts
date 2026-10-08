import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { AuthConfig } from '../../src/auth/auth.config.js';
import { API_V1_ROUTES } from '../../src/common/api-v1-routes.js';
import { learningApp, type Account } from '../support/learning-fixture.js';

/** Legacy routes that deliberately have no /api/v1/<domain> alias. */
const UNALIASED: RegExp[] = [
  /^GET \/$/,
  /^GET \/health\//,
  /^(GET|POST) \/auth\//,
  /^GET \/avatars\//,
  /^GET \/(course|lesson)-media\//,
  // Payment routes already live under /api/v1 and keep their own shape.
  /\/api\/v1\//,
  /^(GET|POST) \/orders/,
  /^POST \/enrollments\/free$/,
  /^GET \/payments\/methods$/,
  /^POST \/payments\/webhook\//,
  /^(GET|POST) \/admin\/orders/,
  /^GET \/student\/orders$/,
  // Compatibility twin of /lessons/:lessonId/progress/complete.
  /^POST \/lessons\/:lessonId\/complete$/,
];

describe('/api/v1/<domain> surface', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  let origin: string;
  let student: Account;
  let instructor: Account;
  let admin: Account;

  beforeAll(async () => {
    t = await learningApp('api-v1');
    origin = t.app.get(AuthConfig).origin;
    student = await t.account('student');
    instructor = await t.account('instructor');
    admin = await t.account('admin');
  });
  afterAll(() => t?.app.close());

  const get = (path: string, session?: string) => {
    const req = t.http().get(path);
    return session ? req.set('Cookie', session) : req;
  };

  it('aliases only existing routes and classifies every other route', () => {
    const router = t.app.getHttpAdapter().getInstance().router as {
      stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }>;
    };
    const registered = new Set<string>();
    for (const layer of router.stack)
      if (layer.route)
        for (const method of Object.keys(layer.route.methods))
          registered.add(`${method.toUpperCase()} ${layer.route.path}`);

    const aliased = new Set<string>();
    for (const entry of API_V1_ROUTES)
      for (const method of entry.methods) {
        const key = `${method} ${entry.legacy}`;
        expect(registered.has(key), `alias target missing: ${key}`).toBe(true);
        aliased.add(key);
      }

    const unclassified = [...registered].filter(
      (key) => !aliased.has(key) && !UNALIASED.some((rule) => rule.test(key)),
    );
    expect(unclassified, 'add an alias in api-v1-routes.ts').toEqual([]);
  });

  describe('envelope', () => {
    it('wraps successes and exposes a correlation id', async () => {
      const response = await get('/api/v1/me', student.session).expect(200);
      expect(response.body).toMatchObject({
        success: true,
        statusCode: 200,
        message: 'Success',
        data: { email: student.email },
      });
      expect(response.headers['x-correlation-id']).toBeTruthy();
      expect(response.body.correlationId).toBe(
        response.headers['x-correlation-id'],
      );
    });

    it('keeps a safe caller-supplied correlation id and replaces an unsafe one', async () => {
      const kept = await get('/api/v1/me', student.session).set(
        'X-Correlation-Id',
        'trace-1234.abcd',
      );
      expect(kept.headers['x-correlation-id']).toBe('trace-1234.abcd');
      const replaced = await get('/api/v1/me', student.session).set(
        'X-Correlation-Id',
        'x',
      );
      expect(replaced.headers['x-correlation-id']).not.toBe('x');
    });

    it('serves the public domain without a session', async () => {
      const response = await get('/api/v1/public/courses').expect(200);
      expect(response.body.success).toBe(true);
      expect(response.body.statusCode).toBe(200);
    });

    it('creates through an alias with the same handler and validation', async () => {
      const created = await t
        .http()
        .post('/api/v1/instructor/courses')
        .set('Origin', origin)
        .set('Cookie', instructor.session)
        .send({ title: 'Envelope course', slug: `env-${randomUUID()}` })
        .expect(201);
      expect(created.body).toMatchObject({
        success: true,
        statusCode: 201,
        message: 'Created',
        data: { title: 'Envelope course' },
      });
      const invalid = await t
        .http()
        .post('/api/v1/instructor/courses')
        .set('Origin', origin)
        .set('Cookie', instructor.session)
        .send({})
        .expect(400);
      expect(invalid.body).toMatchObject({
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        data: null,
      });
      expect(invalid.body.errors.length).toBeGreaterThan(0);
    });

    it('lifts pagination into meta', async () => {
      const response = await get('/api/v1/admin/users', admin.session).expect(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toMatchObject({ page: expect.any(Number) });
    });
  });

  describe('domain isolation', () => {
    it('rejects anonymous callers on non-public domains', async () => {
      const response = await get('/api/v1/student/enrolled-courses').expect(401);
      expect(response.body).toMatchObject({ success: false, statusCode: 401 });
    });

    it('keeps students out of the instructor and admin domains', async () => {
      for (const path of [
        '/api/v1/instructor/quizzes',
        '/api/v1/instructor/grading-queue',
        '/api/v1/admin/users',
      ]) {
        const response = await get(path, student.session).expect(403);
        expect(response.body).toMatchObject({
          success: false,
          statusCode: 403,
          data: { code: 'FORBIDDEN_DOMAIN' },
        });
      }
    });

    it('keeps instructors out of the admin domain but lets them author', async () => {
      await get('/api/v1/admin/users', instructor.session).expect(403);
      await get('/api/v1/instructor/quizzes', instructor.session).expect(200);
    });

    it('still enforces the handler roles inside an allowed domain', async () => {
      // Any signed-in user passes the student domain; enrolling is student-only.
      const response = await t
        .http()
        .post(`/api/v1/student/courses/${randomUUID()}/enroll`)
        .set('Origin', origin)
        .set('Cookie', admin.session)
        .send({});
      expect([403, 404]).toContain(response.status);
      expect(response.body.success).toBe(false);
    });
  });

  describe('errors', () => {
    it('answers an unknown route under a known domain with an envelope', async () => {
      const response = await get('/api/v1/admin/nope', admin.session).expect(404);
      expect(response.body).toMatchObject({ success: false, statusCode: 404 });
    });
  });

  describe('legacy routes are unchanged', () => {
    it('returns bare bodies and bare errors', async () => {
      const me = await get('/users/me', student.session).expect(200);
      expect(me.body.email).toBe(student.email);
      expect(me.body.success).toBeUndefined();
      const denied = await get('/admin/quizzes', student.session).expect(403);
      expect(denied.body.success).toBeUndefined();
      expect(denied.body.statusCode).toBe(403);
      expect(denied.headers['x-correlation-id']).toBeTruthy();
    });
  });
});
