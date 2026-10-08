import { CacheStore } from './cache-store.js';

type Entry = { value: string; expiresAt: number };

/**
 * Per-process store: the default without REDIS_URL, and what the tests use.
 * Bounded, so a flood of distinct keys cannot grow the heap without limit.
 */
export class MemoryCacheStore extends CacheStore {
  readonly kind = 'memory' as const;
  private readonly entries = new Map<string, Entry>();
  private readonly counters = new Map<string, number>();

  constructor(
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {
    super();
  }

  get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    // Re-inserting moves the key to the end, so the first key is the oldest.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return Promise.resolve();
  }

  increment(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return Promise.resolve(next);
  }

  readCounter(key: string): Promise<number> {
    return Promise.resolve(this.counters.get(key) ?? 0);
  }

  close(): Promise<void> {
    this.entries.clear();
    return Promise.resolve();
  }
}
