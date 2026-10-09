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
  let db: DatabaseService['dataSource']['manager'];
  let origin: string;
  const emails = Array.from(
    { length: 4 },
    () => `${randomUUID()}@example.invalid`,
  );
  const googleVerify = vi.fn();
  let testIp: string;
  beforeEach(() => {
    testIp = `e2e-${randomUUID()}`;
  });
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleProvider)
      .useValue({ client: () => ({}), verify: googleVerify })
      .compile();
    app = module.createNestApplication();
    // Keep the rate-limit test from exhausting subsequent tests
    // while retaining the real limiter and database rows.
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', { value: testIp });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).dataSource.manager;
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

  it('changes only the authenticated user password and revokes the current session', async () => {
    const email = `${randomUUID()}@example.invalid`;
    const session = cookies(await register(email));
    const otherSession = cookies(
      await post('/auth/login').send({ email, password }).expect(200),
    );
    const before = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [email])
      .then((rows) => rows[0]);
    const newPassword = 'Changed-long-password-43';
    const change = (body: object, auth = session, requestOrigin = origin) =>
      request(app.getHttpServer())
        .patch('/users/me/password')
        .set('Origin', requestOrigin)
        .set('Cookie', auth)
        .send(body);
    const body = { currentPassword: password, newPassword };
    await change(body, []).expect(401);
    await change(body, session, 'https://evil.example').expect(403);
    await change({ ...body, userId: randomUUID() }).expect(400);
    await change({ ...body, newPassword: 'short' }).expect(400);
    await change({ ...body, newPassword: 'a'.repeat(129) }).expect(400);
    await change({ newPassword }).expect(400);
    await change({ ...body, currentPassword: 'incorrect-password' }).expect(
      400,
    );
    await change({ ...body, newPassword: password }).expect(400);
    expect(
      (
        await db
          .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [email])
          .then((rows) => rows[0])
      ).password_hash,
    ).toBe(before.password_hash);
    const changed = await change(body).expect(204);
    expect(String(changed.headers['set-cookie'])).toContain('shanity_access=;');
    expect(String(changed.headers['set-cookie'])).toContain(
      'shanity_refresh=;',
    );
    const after = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [email])
      .then((rows) => rows[0]);
    expect(after.password_hash).not.toBe(before.password_hash);
    expect(after.password_hash).not.toBe(newPassword);
    const { password_hash: _old, updated_at: _oldTime, ...oldFields } = before;
    const { password_hash: _new, updated_at: _newTime, ...newFields } = after;
    expect(newFields).toEqual(oldFields);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', session)
      .expect(401);
    await post('/auth/refresh').set('Cookie', session).expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', otherSession)
      .expect(200);
    await post('/auth/login').send({ email, password }).expect(401);
    await post('/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
  });

  it('rejects OAuth-only password changes and throttles attempts', async () => {
    const email = `${randomUUID()}@example.invalid`;
    const session = cookies(await register(email));
    await db
      .query('UPDATE "users" SET "password_hash" = $2 WHERE "email" = $1', [
        email,
        null,
      ])
      .then(([, count]) => count);
    const profile = await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', session)
      .expect(200);
    expect(profile.body.hasPassword).toBe(false);
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await request(app.getHttpServer())
        .patch('/users/me/password')
        .set('Origin', origin)
        .set('Cookie', session)
        .send({
          currentPassword: password,
          newPassword: 'Changed-long-password-43',
        })
        .expect(400);
      expect(result.body.message).toContain('Google');
    }
    await request(app.getHttpServer())
      .patch('/users/me/password')
      .set('Origin', origin)
      .set('Cookie', session)
      .send({
        currentPassword: password,
        newPassword: 'Changed-long-password-43',
      })
      .expect(429);
    expect(
      (
        await db
          .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [email])
          .then((rows) => rows[0])
      ).password_hash,
    ).toBeNull();
  });

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
    expect(String(registered.headers['set-cookie'])).toContain('HttpOnly');
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
    const [row] = await db.query('SELECT * FROM "users" WHERE "email" = $1', [
      emails[0],
    ]);
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [row.id, 'admin'],
    );
    await request(app.getHttpServer())
      .get('/users/admin-check')
      .set('Cookie', session)
      .expect(200);
    await db
      .query(
        'DELETE FROM "user_roles" WHERE "user_id" = $1 AND "role_code" = $2',
        [row.id, 'admin'],
      )
      .then(([, count]) => count);
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
    await db
      .query('UPDATE "users" SET "status" = $2 WHERE "email" = $1', [
        emails[0],
        'disabled',
      ])
      .then(([, count]) => count);
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
    const stored = await db
      .query(
        'SELECT * FROM "auth_sessions" WHERE "refresh_hash" = $1 LIMIT 1',
        [digest(raw)],
      )
      .then((rows) => rows[0]);
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
    const stored = await db
      .query(
        'SELECT * FROM "auth_sessions" WHERE "refresh_hash" = $1 LIMIT 1',
        [digest(raw)],
      )
      .then((rows) => rows[0]);
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
    await db
      .query('UPDATE "auth_sessions" SET "expires_at" = $2 WHERE "id" = $1', [
        stored.id,
        new Date(Date.now() - 1000),
      ])
      .then(([, count]) => count);
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
      await db
        .query(
          'SELECT * FROM "auth_identities" WHERE "provider_subject" = $1 LIMIT 1',
          [sub],
        )
        .then((rows) => rows[0]),
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

  it('aggregates user statistics for admin without double-counting multiple roles', async () => {
    const adminEmail = `${randomUUID()}@example.invalid`;
    const studentEmail = `${randomUUID()}@example.invalid`;
    const adminSession = cookies(await register(adminEmail));
    const studentSession = cookies(await register(studentEmail));
    const admin = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [adminEmail])
      .then((rows) => rows[0]);
    const student = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [studentEmail])
      .then((rows) => rows[0]);
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [admin.id, 'admin'],
    );
    const stats = (session?: string[]) => {
      const req = request(app.getHttpServer()).get('/users/stats');
      return session ? req.set('Cookie', session) : req;
    };
    await stats().expect(401);
    await stats(studentSession).expect(403);
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [student.id, 'instructor'],
    );
    await stats(studentSession).expect(403);
    const before = await stats(adminSession).expect(200);
    expect(before.headers['cache-control']).toBe('no-store');
    expect(Object.keys(before.body).sort()).toEqual([
      'activeUsers',
      'admins',
      'instructors',
      'students',
      'totalUsers',
    ]);
    for (const value of Object.values(before.body)) {
      expect(typeof value).toBe('number');
      expect(Number.isInteger(value)).toBe(true);
    }
    const [multi, instructor, noRole] = await db.query(
      'INSERT INTO "users" ("email", "display_name", "status") VALUES ($1, $2, $3), ($4, $5, $6), ($7, $8, $9) RETURNING "id"',
      [
        `${randomUUID()}@example.invalid`,
        'Multi-role',
        'disabled',
        `${randomUUID()}@example.invalid`,
        'Instructor',
        'active',
        `${randomUUID()}@example.invalid`,
        'No role',
        'active',
      ],
    );
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2), ($3, $4), ($5, $6), ($7, $8)',
      [
        multi.id,
        'student',
        multi.id,
        'instructor',
        multi.id,
        'admin',
        instructor.id,
        'instructor',
      ],
    );
    expect(noRole.id).toBeDefined();
    const after = await stats(adminSession).expect(200);
    expect(after.body).toEqual({
      totalUsers: before.body.totalUsers + 3,
      activeUsers: before.body.activeUsers + 2,
      students: before.body.students + 1,
      instructors: before.body.instructors + 2,
      admins: before.body.admins + 1,
    });
    await request(app.getHttpServer())
      .patch(`/users/${multi.id}/status`)
      .set('Origin', origin)
      .set('Cookie', adminSession)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect((await stats(adminSession).expect(200)).body).toEqual({
      ...after.body,
      activeUsers: after.body.activeUsers + 1,
    });
    await request(app.getHttpServer())
      .patch(`/users/${multi.id}/role`)
      .set('Origin', origin)
      .set('Cookie', adminSession)
      .send({ role: 'STUDENT' })
      .expect(200);
    expect((await stats(adminSession).expect(200)).body).toEqual({
      ...after.body,
      activeUsers: after.body.activeUsers + 1,
      instructors: after.body.instructors - 1,
      admins: after.body.admins - 1,
    });
    await db
      .query(
        'DELETE FROM "user_roles" WHERE "user_id" = $1 AND "role_code" = $2',
        [admin.id, 'admin'],
      )
      .then(([, count]) => count);
    await stats(adminSession).expect(403);
  });

  it('manages account status securely without deleting users or changing roles', async () => {
    const adminEmail = `${randomUUID()}@example.invalid`;
    const peerEmail = `${randomUUID()}@example.invalid`;
    const targetEmail = `${randomUUID()}@example.invalid`;
    const adminSession = cookies(await register(adminEmail));
    const peerSession = cookies(await register(peerEmail));
    const targetSession = cookies(await register(targetEmail));
    const admin = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [adminEmail])
      .then((rows) => rows[0]);
    const peer = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [peerEmail])
      .then((rows) => rows[0]);
    const target = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [targetEmail])
      .then((rows) => rows[0]);
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [admin.id, 'admin'],
    );
    const patch = (id: string, session?: string[], source = origin) => {
      const req = request(app.getHttpServer())
        .patch(`/users/${id}/status`)
        .set('Origin', source);
      return session ? req.set('Cookie', session) : req;
    };
    await patch(target.id).send({ status: 'DISABLED' }).expect(401);
    await patch(admin.id, targetSession)
      .send({ status: 'DISABLED' })
      .expect(403);
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [peer.id, 'instructor'],
    );
    await patch(target.id, peerSession)
      .send({ status: 'DISABLED' })
      .expect(403);
    await patch(target.id, adminSession, 'https://untrusted.invalid')
      .send({ status: 'DISABLED' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${target.id}/status`)
      .set('Cookie', adminSession)
      .send({ status: 'DISABLED' })
      .expect(403);
    for (const body of [
      {},
      { status: 'disabled' },
      { status: 'DELETED' },
      { status: null },
      { status: ['ACTIVE'] },
      { status: 'ACTIVE', role: 'ADMIN' },
    ]) {
      await patch(target.id, adminSession).send(body).expect(400);
    }
    await patch('invalid', adminSession).send({ status: 'ACTIVE' }).expect(400);
    await patch(randomUUID(), adminSession)
      .send({ status: 'ACTIVE' })
      .expect(404);
    await patch(admin.id, adminSession)
      .send({ status: 'DISABLED' })
      .expect(409);
    const disabled = await patch(target.id, adminSession)
      .send({ status: 'DISABLED' })
      .expect(200);
    expect(disabled.headers['cache-control']).toBe('no-store');
    expect(disabled.body).toEqual({
      id: target.id,
      email: targetEmail,
      displayName: 'Student',
      status: 'disabled',
      roles: ['student'],
      createdAt: target.created_at.toISOString(),
      updatedAt: expect.any(String),
    });
    expect(new Date(disabled.body.updatedAt).getTime()).toBeGreaterThan(
      target.updated_at.getTime(),
    );
    expect(
      (
        await patch(target.id, adminSession)
          .send({ status: 'DISABLED' })
          .expect(200)
      ).body.updatedAt,
    ).toBe(disabled.body.updatedAt);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', targetSession)
      .expect(401);
    await post('/auth/refresh').set('Cookie', targetSession).expect(401);
    await post('/auth/login')
      .send({ email: targetEmail, password })
      .expect(401);
    const activated = await patch(target.id, adminSession)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(activated.body.status).toBe('active');
    expect(activated.body.roles).toEqual(['student']);
    expect(new Date(activated.body.updatedAt).getTime()).toBeGreaterThan(
      new Date(disabled.body.updatedAt).getTime(),
    );
    await post('/auth/login')
      .send({ email: targetEmail, password })
      .expect(200);
    // Status gating preserves the existing session lifecycle: activation restores valid sessions.
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', targetSession)
      .expect(200);
    const stored = await db
      .query('SELECT * FROM "users" WHERE "id" = $1 LIMIT 1', [target.id])
      .then((rows) => rows[0]);
    expect(stored.password_hash).toBe(target.password_hash);
    expect(stored.created_at).toEqual(target.created_at);
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [peer.id, 'admin'],
    );
    const results = await Promise.all([
      patch(admin.id, peerSession).send({ status: 'DISABLED' }),
      request(app.getHttpServer())
        .patch(`/users/${peer.id}/role`)
        .set('Cookie', adminSession)
        .set('Origin', origin)
        .send({ role: 'STUDENT' }),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(
      results.filter((result) => [401, 403].includes(result.status)),
    ).toHaveLength(1);
    const activeAdmins = await db.query(
      'SELECT * FROM "users" AS "u" JOIN "user_roles" AS "r" ON "r"."user_id" = "u"."id" WHERE "u"."id" = ANY($1) AND "u"."status" = $2 AND "r"."role_code" = $3',
      [[admin.id, peer.id], 'active', 'admin'],
    );
    expect(activeAdmins).toHaveLength(1);
  });

  it('changes roles securely, updates timestamps and serializes competing admins', async () => {
    const adminEmail = `${randomUUID()}@example.invalid`;
    const peerEmail = `${randomUUID()}@example.invalid`;
    const targetEmail = `${randomUUID()}@example.invalid`;
    const adminSession = cookies(await register(adminEmail));
    const peerSession = cookies(await register(peerEmail));
    const targetSession = cookies(await register(targetEmail));
    const admin = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [adminEmail])
      .then((rows) => rows[0]);
    const peer = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [peerEmail])
      .then((rows) => rows[0]);
    const target = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [targetEmail])
      .then((rows) => rows[0]);
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [admin.id, 'admin'],
    );
    const patch = (id: string, session?: string[], source = origin) => {
      const req = request(app.getHttpServer())
        .patch(`/users/${id}/role`)
        .set('Origin', source);
      return session ? req.set('Cookie', session) : req;
    };
    await patch(target.id).send({ role: 'ADMIN' }).expect(401);
    await patch(admin.id, targetSession).send({ role: 'ADMIN' }).expect(403);
    await patch(target.id, adminSession, 'https://untrusted.invalid')
      .send({ role: 'ADMIN' })
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/users/${target.id}/role`)
      .set('Cookie', adminSession)
      .send({ role: 'ADMIN' })
      .expect(403);
    for (const body of [
      {},
      { role: 'admin' },
      { role: 'OWNER' },
      { role: ['ADMIN'] },
      { role: null },
      { role: 'ADMIN', status: 'disabled' },
    ]) {
      await patch(target.id, adminSession).send(body).expect(400);
    }
    await patch('bad-id', adminSession).send({ role: 'ADMIN' }).expect(400);
    await patch(randomUUID(), adminSession).send({ role: 'ADMIN' }).expect(404);
    await patch(admin.id, adminSession).send({ role: 'STUDENT' }).expect(409);
    await patch(admin.id, adminSession)
      .send({ role: 'INSTRUCTOR' })
      .expect(409);
    expect(
      (
        await db
          .query('SELECT "role_code" FROM "user_roles" WHERE "user_id" = $1', [
            admin.id,
          ])
          .then((rows) =>
            rows.map((row: { role_code: string }) => row.role_code),
          )
      ).sort((a: string, b: string) => a.localeCompare(b)),
    ).toEqual(['admin', 'student']);
    const instructor = await patch(target.id, adminSession)
      .send({ role: 'INSTRUCTOR' })
      .expect(200);
    expect(instructor.headers['cache-control']).toBe('no-store');
    expect(instructor.body).toEqual({
      id: target.id,
      email: targetEmail,
      displayName: 'Student',
      roles: ['instructor'],
      status: 'active',
      createdAt: target.created_at.toISOString(),
      updatedAt: expect.any(String),
    });
    expect(new Date(instructor.body.updatedAt).getTime()).toBeGreaterThan(
      target.updated_at.getTime(),
    );
    await patch(peer.id, targetSession).send({ role: 'ADMIN' }).expect(403);
    const repeated = await patch(target.id, adminSession)
      .send({ role: 'INSTRUCTOR' })
      .expect(200);
    expect(repeated.body.updatedAt).toBe(instructor.body.updatedAt);
    await patch(target.id, adminSession).send({ role: 'ADMIN' }).expect(200);
    await request(app.getHttpServer())
      .get('/users/admin-check')
      .set('Cookie', targetSession)
      .expect(200);
    await patch(target.id, adminSession).send({ role: 'STUDENT' }).expect(200);
    await request(app.getHttpServer())
      .get('/users/admin-check')
      .set('Cookie', targetSession)
      .expect(403);
    // Profile writes also advance the database-managed timestamp.
    const before = await db
      .query('SELECT "updated_at" FROM "users" WHERE "id" = $1 LIMIT 1', [
        target.id,
      ])
      .then((rows) => rows[0]);
    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Origin', origin)
      .set('Cookie', targetSession)
      .send({ displayName: 'Updated profile' })
      .expect(200);
    const after = await db
      .query('SELECT "updated_at" FROM "users" WHERE "id" = $1 LIMIT 1', [
        target.id,
      ])
      .then((rows) => rows[0]);
    expect(after.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    );
    await patch(peer.id, adminSession).send({ role: 'ADMIN' }).expect(200);
    const results = await Promise.all([
      patch(peer.id, adminSession).send({ role: 'STUDENT' }),
      patch(admin.id, peerSession).send({ role: 'INSTRUCTOR' }),
    ]);
    expect(
      results.map((result) => result.status).sort((a, b) => a - b),
    ).toEqual([200, 403]);
    const remaining = await db.query(
      'SELECT * FROM "user_roles" WHERE "user_id" = ANY($1) AND "role_code" = $2',
      [[admin.id, peer.id], 'admin'],
    );
    expect(remaining).toHaveLength(1);
  });

  it('reads user detail for admin only with safe fields and preserves static routes', async () => {
    const adminEmail = `${randomUUID()}@example.invalid`;
    const targetEmail = `${randomUUID()}@example.invalid`;
    const adminSession = cookies(await register(adminEmail));
    const targetSession = cookies(await register(targetEmail));
    const admin = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [adminEmail])
      .then((rows) => rows[0]);
    const target = await db
      .query('SELECT * FROM "users" WHERE "email" = $1 LIMIT 1', [targetEmail])
      .then((rows) => rows[0]);
    const detail = (id: string, session?: string[]) => {
      const req = request(app.getHttpServer()).get(`/users/${id}`);
      return session ? req.set('Cookie', session) : req;
    };
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [admin.id, 'admin'],
    );
    await detail(target.id).expect(401);
    await detail(target.id, targetSession).expect(403);
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [target.id, 'instructor'],
    );
    await detail(target.id, targetSession).expect(403);
    const result = await detail(target.id, adminSession).expect(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body).toEqual({
      id: target.id,
      email: targetEmail,
      displayName: 'Student',
      status: 'active',
      roles: ['instructor', 'student'],
      createdAt: target.created_at.toISOString(),
      updatedAt: target.updated_at.toISOString(),
    });
    await db
      .query('UPDATE "users" SET "status" = $2 WHERE "id" = $1', [
        target.id,
        'disabled',
      ])
      .then(([, count]) => count);
    expect(
      (await detail(target.id, adminSession).expect(200)).body.status,
    ).toBe('disabled');
    await detail(randomUUID(), adminSession).expect(404);
    await detail('invalid-uuid', adminSession).expect(400);
    expect((await detail('me', adminSession).expect(200)).body.id).toBe(
      admin.id,
    );
    expect(
      (await detail('admin-check', adminSession).expect(200)).body,
    ).toEqual({ authorized: true });
    await db
      .query(
        'DELETE FROM "user_roles" WHERE "user_id" = $1 AND "role_code" = $2',
        [admin.id, 'admin'],
      )
      .then(([, count]) => count);
    await detail(target.id, adminSession).expect(403);
  });

  it('lists users for admin only, paginates and rejects invalid paging', async () => {
    const adminEmail = `${randomUUID()}@example.invalid`;
    const studentEmail = `${randomUUID()}@example.invalid`;
    const instructorEmail = `${randomUUID()}@example.invalid`;
    const adminSession = cookies(await register(adminEmail));
    const studentSession = cookies(await register(studentEmail));
    const instructorSession = cookies(await register(instructorEmail));
    const [adminRow] = await db.query(
      'SELECT * FROM "users" WHERE "email" = $1',
      [adminEmail],
    );
    const [instructorRow] = await db.query(
      'SELECT * FROM "users" WHERE "email" = $1',
      [instructorEmail],
    );
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [adminRow.id, 'admin'],
    );
    await db.query(
      'INSERT INTO "user_roles" ("user_id", "role_code") VALUES ($1, $2)',
      [instructorRow.id, 'instructor'],
    );

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

    const filtered = (query: Record<string, string | number | undefined>) =>
      request(app.getHttpServer())
        .get('/users')
        .query(query)
        .set('Cookie', adminSession);
    const match = await filtered({
      search: adminEmail.toUpperCase(),
      role: 'admin',
      status: 'active',
      limit: 1,
    }).expect(200);
    expect(match.body.total).toBe(1);
    expect(match.body.items[0].roles.sort()).toEqual(['admin', 'student']);
    expect(
      (await filtered({ search: adminEmail, page: 2, limit: 1 }).expect(200))
        .body.items,
    ).toEqual([]);
    expect(
      (await filtered({ search: adminEmail, status: 'disabled' }).expect(200))
        .body.total,
    ).toBe(0);
    const nameSuffix = randomUUID();
    await db
      .query(
        'UPDATE "users" SET "display_name" = $2, "status" = $3 WHERE "id" = $1',
        [instructorRow.id, `Filter_Name%Unique-${nameSuffix}`, 'disabled'],
      )
      .then(([, count]) => count);
    const byName = await filtered({
      search: `name%unique-${nameSuffix}`,
      status: 'disabled',
      role: 'instructor',
    }).expect(200);
    expect(byName.body.total).toBe(1);
    expect(byName.body.items[0].id).toBe(instructorRow.id);
    expect(
      (
        await filtered({ search: `Filter_Name_Unique-${nameSuffix}` }).expect(
          200,
        )
      ).body.total,
    ).toBe(0);
    for (const query of [
      { role: 'owner' },
      { status: 'pending' },
      { search: 'x'.repeat(255) },
      { page: 2147483648 },
    ]) {
      await filtered(query).expect(400);
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
