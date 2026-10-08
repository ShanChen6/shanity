import { describe, expect, it } from 'vitest';
import { API_V1_ROUTES, resolveApiV1 } from '../../src/common/api-v1-routes.js';
import { successEnvelope } from '../../src/common/api-response.js';

describe('resolveApiV1', () => {
  it('rewrites an alias onto its legacy route, filling params', () => {
    expect(
      resolveApiV1('GET', '/api/v1/student/quiz-attempts/abc/result'),
    ).toEqual({
      domain: 'student',
      legacyPath: '/quiz-attempts/abc/result',
    });
    expect(
      resolveApiV1('POST', '/api/v1/instructor/quizzes/q1/questions'),
    ).toEqual({
      domain: 'instructor',
      legacyPath: '/admin/quizzes/q1/questions',
    });
  });

  it('prefers the most literal alias regardless of declaration order', () => {
    expect(resolveApiV1('GET', '/api/v1/admin/users/stats')?.legacyPath).toBe(
      '/users/stats',
    );
    expect(resolveApiV1('GET', '/api/v1/admin/users/123')?.legacyPath).toBe(
      '/users/123',
    );
    expect(
      resolveApiV1('GET', '/api/v1/student/quizzes/standalone')?.legacyPath,
    ).toBe('/quizzes/standalone');
  });

  it('is method-aware and treats HEAD as GET', () => {
    expect(resolveApiV1('GET', '/api/v1/me')?.legacyPath).toBe('/users/me');
    expect(resolveApiV1('HEAD', '/api/v1/me')?.legacyPath).toBe('/users/me');
    expect(resolveApiV1('DELETE', '/api/v1/me')).toEqual({ domain: 'me' });
  });

  it('tags an unknown route under a known domain without rewriting it', () => {
    expect(resolveApiV1('GET', '/api/v1/admin/nope')).toEqual({
      domain: 'admin',
    });
  });

  it('ignores everything outside the domain surface', () => {
    expect(resolveApiV1('GET', '/courses')).toBeUndefined();
    expect(resolveApiV1('GET', '/api/v1/orders')).toBeUndefined();
    expect(resolveApiV1('GET', '/api/v1/administrator/users')).toBeUndefined();
    // Payments already live natively under /api/v1 and keep their shape.
    expect(resolveApiV1('GET', '/api/v1/admin/orders/1')).toBeUndefined();
    expect(resolveApiV1('GET', '/api/v1/student/orders')).toBeUndefined();
  });

  it('does not let an encoded or empty segment match a param', () => {
    expect(resolveApiV1('GET', '/api/v1/student/courses/')).toEqual({
      domain: 'student',
    });
  });

  it('keeps the route table free of duplicates and param-name drift', () => {
    const keys = API_V1_ROUTES.flatMap((r) =>
      r.methods.map((m) => `${m} ${r.v1}`),
    );
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of API_V1_ROUTES) {
      const params = (path: string) =>
        path.split('/').filter((s) => s.startsWith(':'));
      expect(params(r.v1), r.v1).toEqual(params(r.legacy));
    }
  });
});

describe('successEnvelope', () => {
  it('wraps plain values', () => {
    expect(successEnvelope(200, { a: 1 }, 'cid')).toEqual({
      success: true,
      statusCode: 200,
      message: 'Success',
      data: { a: 1 },
      correlationId: 'cid',
    });
    expect(successEnvelope(201, undefined).data).toBeNull();
    expect(successEnvelope(201, undefined).message).toBe('Created');
  });

  it('lifts both existing pagination shapes into data + meta', () => {
    const items = successEnvelope(200, {
      items: [1, 2],
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
    });
    expect(items.data).toEqual([1, 2]);
    expect(items.meta).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
    const data = successEnvelope(200, {
      data: ['x'],
      page: 1,
      limit: 10,
      total: 1,
    });
    expect(data.data).toEqual(['x']);
    expect(data.meta?.totalPages).toBe(1);
  });

  it('lifts the nested `pagination` shape used by queues and histories', () => {
    const out = successEnvelope(200, {
      attempts: [{ id: 'a' }],
      pagination: { page: 1, limit: 20, totalItems: 41, totalPages: 3 },
    });
    expect(out.data).toEqual([{ id: 'a' }]);
    expect(out.meta).toEqual({ page: 1, limit: 20, total: 41, totalPages: 3 });
    const noTotalPages = successEnvelope(200, {
      quizzes: [],
      pagination: { page: 2, limit: 10, total: 25 },
    });
    expect(noTotalPages.meta?.totalPages).toBe(3);
  });

  it('keeps the nested shape intact when other fields travel with the list', () => {
    const value = {
      items: [1],
      summary: { open: 1 },
      pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
    };
    const out = successEnvelope(200, value);
    expect(out.data).toEqual(value);
    expect(out.meta).toBeUndefined();
  });

  it('leaves non-paginated objects that merely contain `data` alone', () => {
    const value = { data: [1], note: 'no paging fields' };
    const out = successEnvelope(200, value);
    expect(out.data).toEqual(value);
    expect(out.meta).toBeUndefined();
  });
});
