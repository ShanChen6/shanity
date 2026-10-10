export interface RateLimitResult {
  allowed: boolean;
  /** When refused: milliseconds until the oldest counted hit leaves the window. */
  retryAfterMs: number;
}

/**
 * Sliding-window limiter: at most `limit` accepted hits per `key` in any
 * `windowMs` span. Refused hits are not counted, so a client that backs off
 * is let through as soon as the window allows.
 */
export abstract class RateLimiter {
  abstract consume(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<RateLimitResult>;
  abstract close(): Promise<void>;

  onApplicationShutdown() {
    return this.close();
  }
}
