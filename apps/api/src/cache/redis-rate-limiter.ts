import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { MemoryRateLimiter } from './memory-rate-limiter.js';
import { RateLimiter, type RateLimitResult } from './rate-limiter.js';

/**
 * Sliding-window log in one sorted set per key, evaluated atomically. Time is
 * Redis's own clock, so serverless instances with drifting clocks still agree.
 * Returns {allowed, retryAfterMs}.
 */
const SLIDING_WINDOW = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', key, '-inf', now - window)
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now, ARGV[3])
  redis.call('PEXPIRE', key, window)
  return {1, 0}
end
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
return {0, tonumber(oldest[2]) + window - now}
`;

/**
 * Shared limiter across every API instance. Fails safe rather than open: if
 * Redis cannot answer, the hit is judged by a per-process limiter instead, so
 * an outage loosens the limit (per instance) but never removes it.
 */
export class RedisRateLimiter extends RateLimiter {
  private readonly logger = new Logger('RedisRateLimiter');
  private readonly redis: Redis;
  private readonly fallback = new MemoryRateLimiter();
  private warnedAt = 0;
  private readonly firstAttempt: Promise<void>;

  constructor(url: string) {
    super();
    this.redis = new Redis(url, {
      keyPrefix: 'shanity:ratelimit:',
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 500,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
    });
    this.firstAttempt = new Promise((resolve) => {
      const settle = () => resolve();
      this.redis.once('ready', settle);
      this.redis.once('error', settle);
      this.redis.once('close', settle);
    });
    this.redis.on('error', (error: Error) => this.warn(error));
  }

  async consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    try {
      await this.firstAttempt;
      const [allowed, retryAfterMs] = (await this.redis.eval(
        SLIDING_WINDOW,
        1,
        key,
        limit,
        windowMs,
        randomUUID(),
      )) as [number, number];
      return { allowed: allowed === 1, retryAfterMs: Number(retryAfterMs) };
    } catch (error) {
      this.warn(error as Error);
      return this.fallback.consume(key, limit, windowMs);
    }
  }

  /** At most one warning a minute; the code, never the message (it can embed the URL). */
  private warn(error: Error) {
    const now = Date.now();
    if (now - this.warnedAt < 60_000) return;
    this.warnedAt = now;
    this.logger.warn({
      error: error.name,
      code: (error as { code?: string }).code,
    });
  }

  async close() {
    await this.fallback.close();
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
