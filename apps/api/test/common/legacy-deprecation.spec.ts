import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  findApiV1Successors,
  resolveApiV1,
} from '../../src/common/api-v1-routes.js';
import {
  DEFAULT_DEPRECATED_SINCE,
  legacyDeprecationMiddleware,
  readLegacyRoutePolicy,
} from '../../src/common/legacy-deprecation.middleware.js';
import { AuthConfig } from '../../src/auth/auth.config.js';
import { learningApp } from '../support/learning-fixture.js';

describe('findApiV1Successors', () => {
  it('names the alias of an old route, carrying params across', () => {
    expect(findApiV1Successors('GET', '/quiz-attempts/a1/result')).toEqual({
      pattern: '/quiz-attempts/:attemptId/result',
      successors: ['/api/v1/student/quiz-attempts/a1/result'],
    });
    expect(findApiV1Successors('GET', '/users/me')?.successors).toEqual([
      '/api/v1/me',
    ]);
  });

  it('lists every domain that serves a shared handler', () => {
    expect(findApiV1Successors('GET', '/courses')?.successors).toEqual([
      '/api/v1/student/courses',
      '/api/v1/instructor/courses',
    ]);
  });

  it('prefers the most literal route and is method-aware', () => {
    expect(findApiV1Successors('GET', '/users/stats')?.pattern).toBe(
      '/users/stats',
    );
    expect(findApiV1Successors('GET', '/users/123')?.pattern).toBe(
      '/users/:id',
    );
    expect(findApiV1Successors('DELETE', '/users/me')).toBeUndefined();
  });

  it('leaves routes that never move, and /api/v1 itself, alone', () => {
    for (const path of ['/auth/login', '/health/db', '/avatars/x.png', '/'])
      expect(findApiV1Successors('GET', path), path).toBeUndefined();
    expect(findApiV1Successors('GET', '/api/v1/me')).toBeUndefined();
  });

  it('is the exact inverse of resolveApiV1 for every alias', () => {
    const paths = [
      '/api/v1/student/lessons/l1/progress/start',
      '/api/v1/instructor/quizzes/q1/questions/reorder',
      '/api/v1/admin/users/u1/role',
    ];
    for (const v1 of paths) {
      const method = v1.endsWith('/start') ? 'POST' : 'PATCH';
      const legacy = resolveApiV1(method, v1)!.legacyPath!;
      expect(findApiV1Successors(method, legacy)?.successors).toContain(v1);
    }
  });
});

describe('readLegacyRoutePolicy', () => {
  it('defaults to deprecated with no sunset', () => {
    const policy = readLegacyRoutePolicy({});
    expect(policy.deprecatedSince).toEqual(new Date(DEFAULT_DEPRECATED_SINCE));
    expect(policy.sunset).toBeUndefined();
  });

  it('reads a sunset date and rejects a malformed or earlier one', () => {
    expect(
      readLegacyRoutePolicy({ LEGACY_ROUTES_SUNSET: '2027-06-30T00:00:00Z' })
        .sunset,
    ).toEqual(new Date('2027-06-30T00:00:00Z'));
    expect(() =>
      readLegacyRoutePolicy({ LEGACY_ROUTES_SUNSET: 'next spring' }),
    ).toThrow(/ISO 8601/);
    expect(() =>
      readLegacyRoutePolicy({ LEGACY_ROUTES_SUNSET: '2020-01-01' }),
    ).toThrow(/later than/);
  });
});

describe('legacyDeprecationMiddleware', () => {
  const run = (
    policy: Parameters<typeof legacyDeprecationMiddleware>[0],
    now: Date,
    req: Record<string, unknown>,
  ) => {
    const headers: Record<string, string> = {};
    let status = 0;
    let body: unknown;
    let nexted = false;
    const res = {
      setHeader: (k: string, v: string) => (headers[k] = v),
      status(code: number) {
        status = code;
        return this;
      },
      json(value: unknown) {
        body = value;
      },
    };
    legacyDeprecationMiddleware(policy, () => now)(
      { method: 'GET', ...req } as never,
      res as never,
      () => (nexted = true),
    );
    return { headers, status, body, nexted };
  };
  const policy = {
    deprecatedSince: new Date('2026-10-09T00:00:00Z'),
    sunset: new Date('2027-06-30T00:00:00Z'),
  };

  it('annotates an old route and lets it through before the sunset', () => {
    const out = run(policy, new Date('2026-11-01'), { url: '/users/me?x=1' });
    expect(out.nexted).toBe(true);
    expect(out.headers).toEqual({
      Deprecation: '@1791504000',
      Sunset: 'Wed, 30 Jun 2027 00:00:00 GMT',
      Link: '</api/v1/me>; rel="successor-version"',
    });
  });

  it('answers 410 with the new location once the sunset has passed', () => {
    const out = run(policy, new Date('2027-07-01'), { url: '/users/me' });
    expect(out.nexted).toBe(false);
    expect(out.status).toBe(410);
    expect(out.body).toMatchObject({ successors: ['/api/v1/me'] });
  });

  it('never refuses when no sunset is announced', () => {
    const out = run(
      { deprecatedSince: policy.deprecatedSince },
      new Date('2099-01-01'),
      { url: '/users/me' },
    );
    expect(out.nexted).toBe(true);
    expect(out.headers).not.toHaveProperty('Sunset');
  });

  it('ignores /api/v1 requests and routes that never move', () => {
    for (const req of [
      { url: '/users/me', apiV1: { domain: 'me' } },
      { url: '/auth/login' },
      { url: '/health/db' },
    ]) {
      const out = run(policy, new Date('2099-01-01'), req);
      expect(out.nexted).toBe(true);
      expect(out.headers).toEqual({});
    }
  });
});

describe('over HTTP', () => {
  let t: Awaited<ReturnType<typeof learningApp>>;
  beforeAll(async () => {
    process.env.LEGACY_ROUTES_SUNSET = '2999-01-01T00:00:00Z';
    t = await learningApp('legacy-deprecation');
  });
  afterAll(async () => {
    delete process.env.LEGACY_ROUTES_SUNSET;
    await t?.app.close();
  });

  it('marks the old URL, not its /api/v1 twin, and still serves it', async () => {
    const student = await t.account('student');
    const old = await t.http().get('/users/me').set('Cookie', student.session);
    expect(old.status).toBe(200);
    expect(old.headers.deprecation).toMatch(/^@\d+$/);
    expect(old.headers.sunset).toBe('Tue, 01 Jan 2999 00:00:00 GMT');
    expect(old.headers.link).toBe('</api/v1/me>; rel="successor-version"');

    const next = await t
      .http()
      .get('/api/v1/me')
      .set('Cookie', student.session);
    expect(next.status).toBe(200);
    expect(next.headers).not.toHaveProperty('deprecation');
    expect(next.headers).not.toHaveProperty('link');
  });

  it('exposes the headers to browser clients and leaves /health alone', async () => {
    const res = await t
      .http()
      .options('/users/me')
      .set('Origin', t.app.get(AuthConfig).origin)
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-expose-headers']).toContain('Sunset');
    const health = await t.http().get('/health/db');
    expect(health.headers).not.toHaveProperty('deprecation');
  });
});
