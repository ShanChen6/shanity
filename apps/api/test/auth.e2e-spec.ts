import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/setup.js';
import { DatabaseService } from '../src/database/database.module.js';
import { GoogleProvider } from '../src/auth/google.service.js';
import { AuthConfig } from '../src/auth/auth.config.js';
import { SignJWT } from 'jose';
import { digest } from '../src/auth/password.js';

const password = 'Testing-a-long-password-42';
const cookies = (res: request.Response): string[] =>
  ((res.headers['set-cookie'] as unknown as string[]) ?? []).map(
    (value) => value.split(';')[0]!,
  );
const tokenCookie = (values: string[], kind: string) =>
  values.find((value) => value.startsWith(`shanity_${kind}=`))!;

describe('Auth + User with PostgreSQL', () => {
  let app: INestApplication;
  let db: DatabaseService['client'];
  let origin: string;
  const emails = Array.from(
    { length: 4 },
    () => `${randomUUID()}@example.invalid`,
  );
  const googleVerify = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleProvider)
      .useValue({ client: () => ({}), verify: googleVerify })
      .compile();
    app = module.createNestApplication();
    // Give this test run its own rate-limit identity without deleting database rows.
    const testIp = `e2e-${randomUUID()}`;
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', { value: testIp });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).client;
    origin = app.get(AuthConfig).origin;
  });
  afterAll(async () => {
    await app?.close();
  });
  const post = (path: string) =>
    request(app.getHttpServer()).post(path).set('Origin', origin);
  async function register(email: string) {
    return post('/auth/register')
      .send({ email, password, displayName: 'Student' })
      .expect(201);
  }

  it('validates registration, normalizes email, assigns only student, restricts profile/admin and CSRF', async () => {
    await post('/auth/register')
      .send({
        email: emails[0],
        password,
        displayName: 'Student',
        role: 'admin',
      })
      .expect(400);
    const registered = await register(` ${emails[0]!.toUpperCase()} `);
    const session = cookies(registered);
    expect(registered.body).toEqual({ authenticated: true });
    expect(registered.headers['set-cookie'].join(';')).toContain('HttpOnly');
    await registerDuplicate();
    const profile = await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', session)
      .expect(200);
    expect(profile.body).toMatchObject({
      email: emails[0],
      roles: ['student'],
    });
    expect(profile.body).not.toHaveProperty('password_hash');
    await request(app.getHttpServer()).get('/users/me').expect(401);
    await request(app.getHttpServer())
      .get('/users/admin-check')
      .set('Cookie', session)
      .expect(403);
    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Origin', origin)
      .set('Cookie', session)
      .send({ displayName: 'Changed', status: 'active', roles: ['admin'] })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Origin', origin)
      .set('Cookie', session)
      .send({ displayName: 'Changed' })
      .expect(200);
    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Origin', 'https://evil.example')
      .set('Cookie', session)
      .send({ displayName: 'Attack' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: emails[0], password })
      .expect(403);
    const [row] = await db('users').where({ email: emails[0] });
    await db('user_roles').insert({ user_id: row.id, role_code: 'admin' });
    await request(app.getHttpServer())
      .get('/users/admin-check')
      .set('Cookie', session)
      .expect(200);
    await db('user_roles')
      .where({ user_id: row.id, role_code: 'admin' })
      .delete();
    await request(app.getHttpServer())
      .get('/users/admin-check')
      .set('Cookie', session)
      .expect(403);
    async function registerDuplicate() {
      await post('/auth/register')
        .send({ email: emails[0], password, displayName: 'Again' })
        .expect(409);
    }
  });

  it('uses generic credential errors and blocks disabled users for login, refresh and access', async () => {
    const wrong = await post('/auth/login')
      .send({ email: emails[0], password: 'not-the-correct-password' })
      .expect(401);
    const absent = await post('/auth/login')
      .send({ email: `${randomUUID()}@example.invalid`, password })
      .expect(401);
    expect(wrong.body).toEqual(absent.body);
    const logged = await post('/auth/login')
      .send({ email: emails[0], password })
      .expect(200);
    const session = cookies(logged);
    await db('users')
      .where({ email: emails[0] })
      .update({ status: 'disabled' });
    await post('/auth/login').send({ email: emails[0], password }).expect(401);
    await post('/auth/refresh').set('Cookie', session).expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', session)
      .expect(401);
  });

  it('rotates refresh atomically, rejects replay, stores only hash and revokes access on logout', async () => {
    const registered = await register(emails[1]!);
    const original = cookies(registered);
    const results = await Promise.all([
      post('/auth/refresh').set('Cookie', original),
      post('/auth/refresh').set('Cookie', original),
    ]);
    expect(results.map((res) => res.status).sort((a, b) => a - b)).toEqual([
      200, 401,
    ]);
    const rotated = cookies(results.find((res) => res.status === 200)!);
    expect(tokenCookie(rotated, 'refresh')).not.toEqual(
      tokenCookie(original, 'refresh'),
    );
    const raw = tokenCookie(rotated, 'refresh').split('=')[1]!;
    const stored = await db('auth_sessions')
      .where({ refresh_hash: digest(raw) })
      .first();
    expect(stored.refresh_hash).not.toEqual(raw);
    await post('/auth/refresh').set('Cookie', original).expect(401);
    await post('/auth/logout').set('Cookie', rotated).expect(204);
    await post('/auth/refresh').set('Cookie', rotated).expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', rotated)
      .expect(401);
  });

  it('rejects expired and tampered access tokens and expired refresh sessions', async () => {
    const logged = await post('/auth/login')
      .send({ email: emails[1], password })
      .expect(200);
    const session = cookies(logged);
    const raw = tokenCookie(session, 'refresh').split('=')[1]!;
    const stored = await db('auth_sessions')
      .where({ refresh_hash: digest(raw) })
      .first();
    const expired = await new SignJWT({ sid: stored.id })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(stored.user_id)
      .setIssuer('shanity')
      .setAudience('shanity-api')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(app.get(AuthConfig).secret);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', `shanity_access=${expired}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', 'shanity_access=invalid-token')
      .expect(401);
    await db('auth_sessions')
      .where({ id: stored.id })
      .update({ expires_at: new Date(Date.now() - 1000) });
    await post('/auth/refresh').set('Cookie', session).expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', session)
      .expect(401);
  });

  it('validates one-time OAuth state, prevents email auto-link and duplicate provider links', async () => {
    const first = cookies(await register(emails[2]!));
    const second = cookies(await register(emails[3]!));
    const sub = randomUUID();
    googleVerify.mockResolvedValue({
      sub,
      email: emails[2],
      name: 'Google Student',
    });
    const login = await request(app.getHttpServer())
      .get('/auth/google')
      .expect(302);
    let state = new URL(login.headers.location).searchParams.get('state')!;
    await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({ state, code: 'fake-code' })
      .expect(302)
      .expect('Location', `${origin}/auth/callback?error=failed`);
    await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({ state, code: 'fake-code' })
      .set('Cookie', cookies(login))
      .expect(302)
      .expect('Location', `${origin}/auth/callback?error=account_conflict`);
    expect(
      await db('auth_identities').where({ provider_subject: sub }).first(),
    ).toBeUndefined();
    const link = await post('/auth/google/link')
      .set('Cookie', first)
      .expect(200);
    state = new URL(link.body.url).searchParams.get('state')!;
    await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({ state, code: 'fake-code' })
      .set('Cookie', [...first, ...cookies(link)])
      .expect(302);
    await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({ state, code: 'fake-code' })
      .set('Cookie', [...first, ...cookies(link)])
      .expect(302)
      .expect('Location', `${origin}/auth/callback?error=failed`);
    const duplicate = await post('/auth/google/link')
      .set('Cookie', second)
      .expect(200);
    state = new URL(duplicate.body.url).searchParams.get('state')!;
    await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({ state, code: 'fake-code' })
      .set('Cookie', [...second, ...cookies(duplicate)])
      .expect(302)
      .expect('Location', `${origin}/auth/callback?error=account_conflict`);
    const cancel = await request(app.getHttpServer())
      .get('/auth/google')
      .expect(302);
    await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({
        state: new URL(cancel.headers.location).searchParams.get('state'),
        error: 'access_denied',
      })
      .set('Cookie', cookies(cancel))
      .expect(302)
      .expect('Location', `${origin}/auth/callback?error=cancelled`);
    // A new verified Google identity creates a student and uses the same sessions.
    googleVerify.mockResolvedValue({
      sub: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
      name: 'New Google Student',
    });
    const fresh = await request(app.getHttpServer())
      .get('/auth/google')
      .expect(302);
    const callback = await request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({
        state: new URL(fresh.headers.location).searchParams.get('state'),
        code: 'fake-code',
      })
      .set('Cookie', cookies(fresh))
      .expect(302);
    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', cookies(callback))
      .expect(200);
    expect(me.body.roles).toEqual(['student']);
  });

  it('rate limits authentication requests', async () => {
    let status = 0;
    for (let i = 0; i < 11; i++)
      status = (await post('/auth/login').send({})).status;
    expect(status).toBe(429);
  });

  it('lists users for admin only, paginates and rejects invalid paging', async () => {
    const adminEmail = `${randomUUID()}@example.invalid`;
    const studentEmail = `${randomUUID()}@example.invalid`;
    const instructorEmail = `${randomUUID()}@example.invalid`;
    const adminSession = cookies(await register(adminEmail));
    const studentSession = cookies(await register(studentEmail));
    const instructorSession = cookies(await register(instructorEmail));
    const [adminRow] = await db('users').where({ email: adminEmail });
    const [instructorRow] = await db('users').where({ email: instructorEmail });
    await db('user_roles').insert({ user_id: adminRow.id, role_code: 'admin' });
    await db('user_roles').insert({
      user_id: instructorRow.id,
      role_code: 'instructor',
    });

    await request(app.getHttpServer()).get('/users').expect(401);
    await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', studentSession)
      .expect(403);
    await request(app.getHttpServer())
      .get('/users')
      .set('Cookie', instructorSession)
      .expect(403);

    const page = await request(app.getHttpServer())
      .get('/users')
      .query({ page: 1, limit: 2 })
      .set('Cookie', adminSession)
      .expect(200);
    expect(page.body).toMatchObject({ page: 1, limit: 2 });
    expect(page.body.items).toHaveLength(2);
    expect(page.body.total).toBeGreaterThanOrEqual(3);
    expect(page.body.totalPages).toBe(Math.ceil(page.body.total / 2));
    for (const item of page.body.items) {
      expect(item).not.toHaveProperty('password_hash');
      expect(item).not.toHaveProperty('passwordHash');
      expect(Array.isArray(item.roles)).toBe(true);
    }

    const full = await request(app.getHttpServer())
      .get('/users')
      .query({ page: 1, limit: 100 })
      .set('Cookie', adminSession)
      .expect(200);
    const adminItem = full.body.items.find(
      (item: { email: string }) => item.email === adminEmail,
    );
    // Registration always grants 'student' first; the admin role was granted in addition.
    expect(adminItem.roles.sort()).toEqual(['admin', 'student']);
    expect(adminItem.status).toBe('active');

    await request(app.getHttpServer())
      .get('/users')
      .query({ page: 0, limit: 10 })
      .set('Cookie', adminSession)
      .expect(400);
    await request(app.getHttpServer())
      .get('/users')
      .query({ page: 1, limit: 0 })
      .set('Cookie', adminSession)
      .expect(400);
    await request(app.getHttpServer())
      .get('/users')
      .query({ page: 1, limit: 101 })
      .set('Cookie', adminSession)
      .expect(400);
    await request(app.getHttpServer())
      .get('/users')
      .query({ page: 'abc', limit: 10 })
      .set('Cookie', adminSession)
      .expect(400);
  });
});
