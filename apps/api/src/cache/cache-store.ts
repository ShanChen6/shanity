/**
 * Port for the shared cache. Implementations must be safe to lose: callers
 * treat any failure as a miss, so an outage can slow the API but never break it.
 */
export abstract class CacheStore {
  /** Which backend answered, for logs and health reporting. */
  abstract readonly kind: 'memory' | 'redis';
  abstract get(key: string): Promise<string | null>;
  abstract set(key: string, value: string, ttlSeconds: number): Promise<void>;
  /** Atomically adds one to a counter (created at 0) and returns the result. */
  abstract increment(key: string): Promise<number>;
  abstract readCounter(key: string): Promise<number>;
  abstract close(): Promise<void>;
}
