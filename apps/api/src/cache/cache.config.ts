/** Cache settings, read from the environment when the module is built. */
export interface CacheConfig {
  /** Shared cache; without it each API process keeps its own. */
  redisUrl: string | null;
  /** Seconds the public catalog may be served from cache; 0 turns it off. */
  publicCatalogTtlSeconds: number;
}

const MAX_TTL_SECONDS = 3600;

function ttl(env: NodeJS.ProcessEnv): number {
  const raw = env.CACHE_PUBLIC_CATALOG_SECONDS;
  // Tests start with it off, so a stale entry can never leak between suites.
  if (raw === undefined || raw.trim() === '')
    return env.NODE_ENV === 'test' ? 0 : 60;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > MAX_TTL_SECONDS)
    throw new Error(
      `CACHE_PUBLIC_CATALOG_SECONDS must be an integer from 0 to ${MAX_TTL_SECONDS}`,
    );
  return value;
}

export function cacheConfig(env: NodeJS.ProcessEnv = process.env): CacheConfig {
  const redisUrl = env.REDIS_URL?.trim();
  if (redisUrl && !/^rediss?:\/\//.test(redisUrl))
    throw new Error('REDIS_URL must start with redis:// or rediss://');
  return {
    redisUrl: redisUrl || null,
    publicCatalogTtlSeconds: ttl(env),
  };
}
