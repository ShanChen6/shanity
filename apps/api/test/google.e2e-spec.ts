import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { randomUUID, createHash } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/setup.js';
import { DatabaseService } from '../src/database/database.module.js';
import { AuthConfig } from '../src/auth/auth.config.js';
import { GoogleProvider } from '../src/auth/google.service.js';
import { digest } from '../src/auth/password.js';

const cookies = (res: request.Response): string[] =>
  ((res.headers['set-cookie'] as unknown as string[]) ?? []).map(
    (v) => v.split(';')[0]!,
  );

describe('Google OAuth backend with PostgreSQL', () => {
  let app: INestApplication;
  let db: DatabaseService['client'];
  let config: AuthConfig;
  let testIp: string;
  const verify = vi.fn();
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GoogleProvider)
      .useValue({ client: () => ({}), verify })
      .compile();
    app = module.createNestApplication();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      Object.defineProperty(req, 'ip', { value: testIp });
      next();
    });
    configureApp(app);
    await app.init();
    db = app.get(DatabaseService).client;
    config = app.get(AuthConfig);
  });
  beforeEach(() => {
    testIp = `oauth-test-${randomUUID()}`;
    verify.mockReset();
  });
  afterAll(async () => {
    await app?.close();
  });

  async function start(session?: string[]) {
    const result = session
      ? await request(app.getHttpServer())
          .post('/auth/google/link')
          .set('Origin', config.origin)
          .set('Cookie', session)
          .expect(200)
      : await request(app.getHttpServer()).get('/auth/google').expect(302);
    const url = new URL(session ? result.body.url : result.headers.location);
    return {
      state: url.searchParams.get('state')!,
      cookie: cookies(result),
      url,
    };
  }
  function callback(
    flow: Awaited<ReturnType<typeof start>>,
    session: string[] = [],
  ) {
    return request(app.getHttpServer())
      .get('/auth/google/callback')
      .query({ state: flow.state, code: 'test-code' })
      .set('Cookie', [...flow.cookie, ...session]);
  }
  async function account() {
    const email = `${randomUUID()}@example.invalid`;
    const result = await request(app.getHttpServer())
      .post('/auth/register')
      .set('Origin', config.origin)
      .send({ email, password: 'long-test-password-42', displayName: 'Test' })
      .expect(201);
    const user = await db('users').where({ email }).first();
    return { session: cookies(result), id: user.id as string };
  }

  it('uses nonce/PKCE and rejects expired or wrong-browser state without contacting provider', async () => {
    const flow = await start();
    const row = await db('oauth_requests')
      .where({ state_hash: digest(flow.state) })
      .first();
    expect(flow.url.searchParams.get('redirect_uri')).toBe(
      config.googleCallback,
    );
    expect(flow.url.searchParams.get('nonce')).toBe(row.nonce);
    expect(flow.url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(flow.url.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(row.verifier).digest('base64url'),
    );
    const other = await start();
    await callback({ ...flow, cookie: other.cookie }).expect(401);
    await db('oauth_requests')
      .where({ state_hash: digest(flow.state) })
      .update({ expires_at: new Date(Date.now() - 1000) });
    await callback(flow).expect(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it('requires the same active browser session when completing a link', async () => {
    const first = await account(),
      second = await account();
    const missing = await start(first.session);
    await callback(missing).expect(401);
    const switched = await start(first.session);
    await callback(switched, second.session).expect(401);
    const revoked = await start(first.session);
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', config.origin)
      .set('Cookie', first.session)
      .expect(204);
    await callback(revoked, first.session).expect(401);
    const disabled = await start(second.session);
    await db('users').where({ id: second.id }).update({ status: 'disabled' });
    await callback(disabled, second.session).expect(401);
    expect(verify).not.toHaveBeenCalled();
  });

  it('logs an existing linked identity in without changing email or adding users, and blocks disabled accounts', async () => {
    const user = await account();
    const identity = {
      sub: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
      name: 'Google',
    };
    verify.mockResolvedValue(identity);
    const link = await start(user.session);
    await callback(link, user.session).expect(302);
    const again = await start(user.session);
    await callback(again, user.session).expect(302);
    expect(
      Number(
        (await db('auth_identities')
          .where({ provider_subject: identity.sub })
          .count('* as n')
          .first())!.n,
      ),
    ).toBe(1);
    const login = await start();
    const response = await callback(login).expect(302);
    expect(response.headers.location).toBe(config.origin);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    const me = await request(app.getHttpServer())
      .get('/users/me')
      .set('Cookie', cookies(response))
      .expect(200);
    expect(me.body.id).toBe(user.id);
    expect(
      await db('users').where({ email: identity.email }).first(),
    ).toBeUndefined();
    await db('users').where({ id: user.id }).update({ status: 'disabled' });
    await callback(await start()).expect(401);
  });

  it('serializes concurrent first login callbacks into one user and identity', async () => {
    const identity = {
      sub: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
      name: 'Google',
    };
    verify.mockResolvedValue(identity);
    const a = await start(),
      b = await start();
    const responses = await Promise.all([callback(a), callback(b)]);
    expect(responses.map((res) => res.status)).toEqual([302, 302]);
    expect(
      Number(
        (await db('users')
          .where({ email: identity.email })
          .count('* as n')
          .first())!.n,
      ),
    ).toBe(1);
    expect(
      Number(
        (await db('auth_identities')
          .where({ provider_subject: identity.sub })
          .count('* as n')
          .first())!.n,
      ),
    ).toBe(1);
  });

  it('allows only one account to win a concurrent link to the same Google identity', async () => {
    const a = await account(),
      b = await account();
    const identity = {
      sub: randomUUID(),
      email: `${randomUUID()}@example.invalid`,
      name: 'Google',
    };
    verify.mockResolvedValue(identity);
    const fa = await start(a.session),
      fb = await start(b.session);
    const results = await Promise.all([
      callback(fa, a.session),
      callback(fb, b.session),
    ]);
    expect(results.map((res) => res.status).sort((x, y) => x - y)).toEqual([
      302, 409,
    ]);
    expect(
      Number(
        (await db('auth_identities')
          .where({ provider_subject: identity.sub })
          .count('* as n')
          .first())!.n,
      ),
    ).toBe(1);
  });

  it('consumes callback state exactly once even when the provider rejects the code', async () => {
    const flow = await start();
    const { UnauthorizedException } = await import('@nestjs/common');
    verify.mockRejectedValue(
      new UnauthorizedException('Google authentication failed'),
    );
    await callback(flow).expect(401);
    await callback(flow).expect(401);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(
      await db('oauth_requests')
        .where({ state_hash: digest(flow.state) })
        .first(),
    ).toBeUndefined();
  });
});
