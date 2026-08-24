import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
import { CacheService } from './services/cache.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Global()
@Module({
  imports: [],
  providers: [CacheService, {
    provide: 'REDIS_CLIENT',
    inject: [ConfigService],
    useFactory(config: ConfigService) {
      const redis = new Redis(config.get<any>('redis'));
      redis.on('disconnect', () => {
        console.error('Redis disconnected');
        redis.quit();
      });
      return redis;
    },
  }],
  exports: [CacheService],
})
export class CacheModule implements OnModuleDestroy {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) { }
  async onModuleDestroy() {
    await this.redisClient.quit();
  }
}
