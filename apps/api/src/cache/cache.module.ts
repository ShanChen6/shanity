import {
  Global,
  Injectable,
  Logger,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { CurriculumEvents } from '../modules/curriculum/curriculum-events.js';
import { CacheStore } from './cache-store.js';
import { cacheConfig, type CacheConfig } from './cache.config.js';
import { CacheService } from './cache.service.js';
import { MemoryCacheStore } from './memory-cache.store.js';
import { RedisCacheStore } from './redis-cache.store.js';
import { MemoryRateLimiter } from './memory-rate-limiter.js';
import { RateLimiter } from './rate-limiter.js';
import { RedisRateLimiter } from './redis-rate-limiter.js';

export const CACHE_CONFIG = Symbol('CACHE_CONFIG');
export const PUBLIC_CATALOG_GROUP = 'public-catalog';

/** Publishing, unpublishing and curriculum edits show up in the catalog at once. */
@Injectable()
class CatalogInvalidator implements OnModuleInit, OnApplicationShutdown {
  private stop?: () => void;

  constructor(
    private readonly events: CurriculumEvents,
    private readonly cache: CacheService,
    private readonly store: CacheStore,
  ) {}

  onModuleInit() {
    this.stop = this.events.onChanged(() =>
      this.cache.invalidate(PUBLIC_CATALOG_GROUP),
    );
  }

  async onApplicationShutdown() {
    this.stop?.();
    await this.store.close();
  }
}

@Global()
@Module({
  providers: [
    { provide: CACHE_CONFIG, useFactory: () => cacheConfig() },
    {
      provide: CacheStore,
      inject: [CACHE_CONFIG],
      useFactory: (config: CacheConfig): CacheStore => {
        const logger = new Logger('Cache');
        if (config.redisUrl) {
          logger.log('Using Redis for the shared cache');
          return new RedisCacheStore(config.redisUrl);
        }
        logger.log('REDIS_URL is not set: using a per-process cache');
        return new MemoryCacheStore();
      },
    },
    {
      provide: RateLimiter,
      inject: [CACHE_CONFIG],
      useFactory: (config: CacheConfig): RateLimiter =>
        // Same Redis as the cache: limits then hold across every instance.
        config.redisUrl
          ? new RedisRateLimiter(config.redisUrl)
          : new MemoryRateLimiter(),
    },
    CacheService,
    CatalogInvalidator,
  ],
  exports: [CacheService, CACHE_CONFIG, RateLimiter],
})
export class CacheModule {}
