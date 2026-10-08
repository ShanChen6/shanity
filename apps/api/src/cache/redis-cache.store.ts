import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CacheStore } from './cache-store.js';

/**
 * Redis adapter. Configured to fail fast: with the offline queue off and a
 * short command timeout, a dead Redis turns into misses in milliseconds
 * instead of requests hanging until the connection comes back.
 */
export class RedisCacheStore extends CacheStore {
  readonly kind = 'redis' as const;
  private readonly logger = new Logger('RedisCache');
  private readonly redis: Redis;
  private warnedAt = 0;
  /** Settles once the first connection attempt has succeeded or failed. */
  private readonly firstAttempt: Promise<void>;

  constructor(url: string) {
    super();
    this.redis = new Redis(url, {
      keyPrefix: 'shanity:cache:',
      maxRetriesPerRequest: 1,
      // A down Redis must turn into misses at once, not queue until it returns.
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 500,
      // Reconnect forever, backing off to 5 s.
      retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
    });
    this.firstAttempt = new Promise((resolve) => {
      const settle = () => resolve();
      this.redis.once('ready', settle);
      this.redis.once('error', settle);
      this.redis.once('close', settle);
    });
    // Without a listener an 'error' event would crash the process.
    this.redis.on('error', (error: Error) => this.warn(error));
  }

  /** At most one warning a minute, whatever the request rate. */
  private warn(error: Error) {
    const now = Date.now();
    if (now - this.warnedAt < 60_000) return;
    this.warnedAt = now;
    // The code ("ECONNREFUSED"), never the message: it can embed the URL.
    this.logger.warn({
      error: error.name,
      code: (error as { code?: string }).code,
    });
  }

  // Commands sent before the socket exists are rejected (no offline queue), so
  // the very first ones wait for that one attempt. After it, nothing waits.
  private async ready(): Promise<Redis> {
    await this.firstAttempt;
    return this.redis;
  }

  async get(key: string): Promise<string | null> {
    return (await this.ready()).get(key);
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await (await this.ready()).set(key, value, 'EX', ttlSeconds);
  }

  async increment(key: string): Promise<number> {
    return (await this.ready()).incr(key);
  }

  async readCounter(key: string): Promise<number> {
    return Number((await (await this.ready()).get(key)) ?? 0);
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}
