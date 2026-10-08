import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CacheService } from '../../src/cache/cache.service.js';
import { RedisCacheStore } from '../../src/cache/redis-cache.store.js';

// Runs only where a Redis is available: REDIS_TEST_URL=redis://localhost:6379
const url = process.env.REDIS_TEST_URL;

describe.skipIf(!url)('RedisCacheStore (real Redis)', () => {
  let store: RedisCacheStore;
  let cache: CacheService;
  const group = `test-${Date.now()}`;

  beforeAll(() => {
    store = new RedisCacheStore(url!);
    cache = new CacheService(store);
  });
  afterAll(() => store?.close());

  it('stores values with a ttl and reads them back', async () => {
    await store.set(`${group}:a`, '"hello"', 30);
    expect(await store.get(`${group}:a`)).toBe('"hello"');
    expect(await store.get(`${group}:missing`)).toBeNull();
  });

  it('expires entries', async () => {
    await store.set(`${group}:short`, '1', 1);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    expect(await store.get(`${group}:short`)).toBeNull();
  });

  it('counts atomically across concurrent increments', async () => {
    await Promise.all(
      Array.from({ length: 20 }, () => store.increment(`${group}:ctr`)),
    );
    expect(await store.readCounter(`${group}:ctr`)).toBe(20);
  });

  it('serves a hit and invalidates by group through the service', async () => {
    let n = 0;
    const load = async () => ++n;
    expect(await cache.remember(group, 'k', 30, load)).toBe(1);
    expect(await cache.remember(group, 'k', 30, load)).toBe(1);
    await cache.invalidate(group);
    expect(await cache.remember(group, 'k', 30, load)).toBe(2);
  });

  it('keeps entries under its own key prefix', async () => {
    await store.set(`${group}:prefixed`, '1', 30);
    const raw = await new (await import('ioredis')).Redis(url!).keys(
      `shanity:cache:${group}:prefixed`,
    );
    expect(raw).toEqual([`shanity:cache:${group}:prefixed`]);
  });
});

describe('RedisCacheStore when Redis is unreachable', () => {
  it('fails fast and the service falls back to the loader', async () => {
    // Nothing listens on this port.
    const store = new RedisCacheStore('redis://127.0.0.1:1');
    const cache = new CacheService(store);
    const startedAt = Date.now();
    const value = await cache.remember('g', 'k', 60, async () => 'from db');
    expect(value).toBe('from db');
    expect(Date.now() - startedAt).toBeLessThan(2000);
    await store.close();
  });
});
