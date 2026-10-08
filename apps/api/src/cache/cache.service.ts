import { Injectable, Logger } from '@nestjs/common';
import { CacheStore } from './cache-store.js';

/**
 * Read-through cache with two guarantees the callers rely on:
 *
 *  - Fail open: any store error is a miss, and the loader's own errors are
 *    never cached, so the cache can only ever make a response faster.
 *  - Cheap invalidation: keys embed their group's version, so `invalidate`
 *    is one counter bump instead of a scan; stale keys simply expire.
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly store: CacheStore) {}

  get backend() {
    return this.store.kind;
  }

  async remember<T>(
    group: string,
    key: string,
    ttlSeconds: number,
    load: () => Promise<T>,
  ): Promise<T> {
    if (ttlSeconds <= 0) return load();
    const version = await this.versionOf(group);
    const fullKey = `${group}:v${version}:${key}`;

    const cached = await this.read<T>(fullKey);
    if (cached !== undefined) return cached;

    // Concurrent misses for one key share a single load (no stampede).
    const pending = this.inFlight.get(fullKey) as Promise<T> | undefined;
    if (pending) return pending;
    const fresh = load()
      .then(async (value) => {
        await this.write(fullKey, value, ttlSeconds);
        return value;
      })
      .finally(() => this.inFlight.delete(fullKey));
    this.inFlight.set(fullKey, fresh);
    return fresh;
  }

  /** Drops everything cached under `group` (its keys become unreachable). */
  async invalidate(group: string): Promise<void> {
    try {
      await this.store.increment(`ver:${group}`);
    } catch (error) {
      // Nothing to do: entries expire on their own, only later than hoped.
      this.logger.warn({ group, error: (error as Error).name });
    }
  }

  private async versionOf(group: string): Promise<number> {
    try {
      return await this.store.readCounter(`ver:${group}`);
    } catch {
      return 0;
    }
  }

  private async read<T>(key: string): Promise<T | undefined> {
    try {
      const raw = await this.store.get(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  }

  private async write(key: string, value: unknown, ttlSeconds: number) {
    try {
      const raw = JSON.stringify(value);
      if (raw !== undefined) await this.store.set(key, raw, ttlSeconds);
    } catch {
      // A value that cannot be stored is simply not cached.
    }
  }
}
