import { describe, expect, it, vi } from 'vitest';
import { CacheStore } from '../../src/cache/cache-store.js';
import { cacheConfig } from '../../src/cache/cache.config.js';
import { CacheService } from '../../src/cache/cache.service.js';
import { MemoryCacheStore } from '../../src/cache/memory-cache.store.js';

const make = (now?: () => number) => {
  const store = new MemoryCacheStore(500, now);
  return { store, cache: new CacheService(store) };
};

describe('CacheService.remember', () => {
  it('loads once, then serves from cache', async () => {
    const { cache } = make();
    const load = vi.fn(async () => ({ n: 1 }));
    expect(await cache.remember('g', 'k', 60, load)).toEqual({ n: 1 });
    expect(await cache.remember('g', 'k', 60, load)).toEqual({ n: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps keys and groups apart', async () => {
    const { cache } = make();
    const a = await cache.remember('g1', 'k', 60, async () => 'a');
    const b = await cache.remember('g1', 'other', 60, async () => 'b');
    const c = await cache.remember('g2', 'k', 60, async () => 'c');
    expect([a, b, c]).toEqual(['a', 'b', 'c']);
  });

  it('expires entries after the ttl', async () => {
    let now = 1_000;
    const { cache } = make(() => now);
    const load = vi.fn(async () => now);
    await cache.remember('g', 'k', 10, load);
    now += 9_999;
    await cache.remember('g', 'k', 10, load);
    expect(load).toHaveBeenCalledTimes(1);
    now += 2;
    expect(await cache.remember('g', 'k', 10, load)).toBe(now);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not cache at all when the ttl is 0', async () => {
    const { cache } = make();
    const load = vi.fn(async () => 'x');
    await cache.remember('g', 'k', 0, load);
    await cache.remember('g', 'k', 0, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one load between concurrent misses', async () => {
    const { cache } = make();
    let release!: (value: string) => void;
    const load = vi.fn(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const calls = [1, 2, 3].map(() => cache.remember('g', 'k', 60, load));
    await new Promise((resolve) => setTimeout(resolve, 10));
    release('done');
    expect(await Promise.all(calls)).toEqual(['done', 'done', 'done']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never caches a failed load and lets the next call retry', async () => {
    const { cache } = make();
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce('ok');
    await expect(cache.remember('g', 'k', 60, load)).rejects.toThrow('db down');
    expect(await cache.remember('g', 'k', 60, load)).toBe('ok');
  });

  it('round-trips dates and nested data as the API would serialise them', async () => {
    const { cache } = make();
    const value = { when: new Date('2026-10-08T00:00:00Z'), rows: [{ a: 1 }] };
    await cache.remember('g', 'k', 60, async () => value);
    const hit = await cache.remember('g', 'k', 60, async () => 'never');
    expect(JSON.parse(JSON.stringify(hit))).toEqual(
      JSON.parse(JSON.stringify(value)),
    );
  });
});

describe('CacheService.invalidate', () => {
  it('makes the next read reload, for every key in the group only', async () => {
    const { cache } = make();
    let n = 0;
    const load = vi.fn(async () => ++n);
    const other = vi.fn(async () => 'stable');
    await cache.remember('catalog', 'a', 60, load);
    await cache.remember('catalog', 'b', 60, load);
    await cache.remember('elsewhere', 'a', 60, other);
    await cache.invalidate('catalog');
    expect(await cache.remember('catalog', 'a', 60, load)).toBe(3);
    expect(await cache.remember('catalog', 'b', 60, load)).toBe(4);
    await cache.remember('elsewhere', 'a', 60, other);
    expect(other).toHaveBeenCalledTimes(1);
  });
});

describe('failing open', () => {
  class Broken extends CacheStore {
    readonly kind = 'redis' as const;
    get = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    set = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    increment = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    readCounter = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    close = vi.fn().mockResolvedValue(undefined);
  }

  it('answers from the loader when every store call fails', async () => {
    const cache = new CacheService(new Broken());
    const load = vi.fn(async () => 'fresh');
    expect(await cache.remember('g', 'k', 60, load)).toBe('fresh');
    expect(await cache.remember('g', 'k', 60, load)).toBe('fresh');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not throw when invalidation cannot reach the store', async () => {
    const cache = new CacheService(new Broken());
    await expect(cache.invalidate('g')).resolves.toBeUndefined();
  });

  it('ignores a corrupt cached payload', async () => {
    const store = new MemoryCacheStore();
    const cache = new CacheService(store);
    await store.set('g:v0:k', '{not json', 60);
    expect(await cache.remember('g', 'k', 60, async () => 'rebuilt')).toBe(
      'rebuilt',
    );
  });
});

describe('MemoryCacheStore', () => {
  it('stays bounded, dropping the oldest entry first', async () => {
    const store = new MemoryCacheStore(3);
    for (const key of ['a', 'b', 'c', 'd']) await store.set(key, key, 60);
    expect(await store.get('a')).toBeNull();
    expect(await store.get('d')).toBe('d');
  });

  it('counts atomically per key', async () => {
    const store = new MemoryCacheStore();
    expect(await store.increment('x')).toBe(1);
    expect(await store.increment('x')).toBe(2);
    expect(await store.readCounter('x')).toBe(2);
    expect(await store.readCounter('missing')).toBe(0);
  });
});

describe('cacheConfig', () => {
  const env = (values: Record<string, string>) =>
    values as unknown as NodeJS.ProcessEnv;

  it('defaults to a one-minute public catalog cache, off under test', () => {
    expect(cacheConfig(env({})).publicCatalogTtlSeconds).toBe(60);
    expect(cacheConfig(env({ NODE_ENV: 'test' })).publicCatalogTtlSeconds).toBe(
      0,
    );
  });

  it('reads an explicit ttl and the Redis url', () => {
    const config = cacheConfig(
      env({
        CACHE_PUBLIC_CATALOG_SECONDS: '120',
        REDIS_URL: 'redis://redis:6379',
      }),
    );
    expect(config).toEqual({
      redisUrl: 'redis://redis:6379',
      publicCatalogTtlSeconds: 120,
    });
  });

  it('treats a blank REDIS_URL as unset', () => {
    expect(cacheConfig(env({ REDIS_URL: '  ' })).redisUrl).toBeNull();
  });

  it.each(['abc', '-1', '1.5', '3601'])('rejects a ttl of %s', (value) => {
    expect(() =>
      cacheConfig(env({ CACHE_PUBLIC_CATALOG_SECONDS: value })),
    ).toThrow(/CACHE_PUBLIC_CATALOG_SECONDS/);
  });

  it('rejects a Redis url with another scheme', () => {
    expect(() => cacheConfig(env({ REDIS_URL: 'http://x' }))).toThrow(
      /REDIS_URL/,
    );
  });
});
