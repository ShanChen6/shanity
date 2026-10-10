import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryRateLimiter } from '../../src/cache/memory-rate-limiter.js';
import { RedisRateLimiter } from '../../src/cache/redis-rate-limiter.js';

describe('MemoryRateLimiter', () => {
  it('allows `limit` hits per sliding window and says when to retry', async () => {
    let now = 1_000;
    const limiter = new MemoryRateLimiter(100, () => now);
    for (let i = 0; i < 5; i++) {
      expect((await limiter.consume('k', 5, 3000)).allowed).toBe(true);
      now += 100;
    }
    // Hits at 1000..1400; at 1500 the oldest leaves the window at 4000.
    expect(await limiter.consume('k', 5, 3000)).toEqual({
      allowed: false,
      retryAfterMs: 2500,
    });
    now = 4001;
    expect((await limiter.consume('k', 5, 3000)).allowed).toBe(true);
    // Only the 1000 hit left; the refused one at 1500 was never counted.
    expect((await limiter.consume('k', 5, 3000)).allowed).toBe(false);
  });

  it('keeps keys apart and stays bounded', async () => {
    const limiter = new MemoryRateLimiter(2, () => 0);
    expect((await limiter.consume('a', 1, 1000)).allowed).toBe(true);
    expect((await limiter.consume('b', 1, 1000)).allowed).toBe(true);
    expect((await limiter.consume('a', 1, 1000)).allowed).toBe(false);
    await limiter.consume('c', 1, 1000); // evicts the oldest key, 'b'
    expect((await limiter.consume('b', 1, 1000)).allowed).toBe(true);
  });
});

// Runs only where a Redis is available: REDIS_TEST_URL=redis://localhost:6379
const url = process.env.REDIS_TEST_URL;

describe.skipIf(!url)('RedisRateLimiter (real Redis)', () => {
  let limiter: RedisRateLimiter;
  beforeAll(() => {
    limiter = new RedisRateLimiter(url!);
  });
  afterAll(() => limiter?.close());

  it('admits exactly `limit` of a concurrent burst, across instances', async () => {
    const key = `test:${randomUUID()}`;
    const other = new RedisRateLimiter(url!);
    try {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          (i % 2 ? other : limiter).consume(key, 5, 3000),
        ),
      );
      expect(results.filter((r) => r.allowed)).toHaveLength(5);
      for (const refused of results.filter((r) => !r.allowed)) {
        expect(refused.retryAfterMs).toBeGreaterThan(0);
        expect(refused.retryAfterMs).toBeLessThanOrEqual(3000);
      }
    } finally {
      await other.close();
    }
  });

  it('lets hits through again once the window slides past them', async () => {
    const key = `test:${randomUUID()}`;
    expect((await limiter.consume(key, 1, 300)).allowed).toBe(true);
    expect((await limiter.consume(key, 1, 300)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect((await limiter.consume(key, 1, 300)).allowed).toBe(true);
  });
});

describe('RedisRateLimiter without a reachable Redis', () => {
  it('still limits, per process, instead of failing open', async () => {
    // Nothing listens on port 1.
    const limiter = new RedisRateLimiter('redis://127.0.0.1:1');
    try {
      const results = [];
      for (let i = 0; i < 7; i++)
        results.push((await limiter.consume('k', 5, 3000)).allowed);
      expect(results).toEqual([true, true, true, true, true, false, false]);
    } finally {
      await limiter.close();
    }
  });
});
