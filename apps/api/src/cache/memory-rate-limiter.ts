import { RateLimiter, type RateLimitResult } from './rate-limiter.js';

/**
 * Per-process limiter: the default without REDIS_URL, and the fallback while
 * Redis is unreachable. Bounded, so a flood of distinct keys cannot grow the
 * heap without limit.
 */
export class MemoryRateLimiter extends RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly maxKeys = 10_000,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  consume(key: string, limit: number, windowMs: number) {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => at > now - windowMs,
    );
    let result: RateLimitResult;
    if (recent.length < limit) {
      recent.push(now);
      result = { allowed: true, retryAfterMs: 0 };
    } else {
      result = { allowed: false, retryAfterMs: recent[0] + windowMs - now };
    }
    // Re-inserting moves the key to the end, so the first key is the oldest.
    this.hits.delete(key);
    this.hits.set(key, recent);
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next().value;
      if (oldest === undefined) break;
      this.hits.delete(oldest);
    }
    return Promise.resolve(result);
  }

  close() {
    this.hits.clear();
    return Promise.resolve();
  }
}
