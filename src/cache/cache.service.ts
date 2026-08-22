import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class CacheService {
    constructor(@Inject('REDIS_CLIENT') private readonly client: Redis) { }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        const serializedValue = JSON.stringify(value);
        if (ttl) {
            await this.client.set(key, serializedValue, 'EX', ttl);
        } else {
            await this.client.set(key, serializedValue);
        }
    }

    async incrBy(key: string, value: number): Promise<number> {
        return this.client.incrby(key, value);
    }

    async decrBy(key: string, value: number): Promise<number> {
        return this.client.decrby(key, value);
    }

    async expire(key: string, ttlSeconds: number): Promise<void> {
        await this.client.expire(key, ttlSeconds);
    }

    async get<T>(key: string): Promise<T | null> {
        const value = await this.client.get(key);
        if (!value) {
            return null;
        }
        return JSON.parse(value);
    }

    async del(key: string): Promise<void> {
        await this.client.del(key);
    }
}

export enum TTL {
    FIVE_MINUTES = 300,
    TEN_MINUTES = 600,
    FIFTEEN_MINUTES = 900,
    ONE_HOUR = 3600,
    TEN_HOURS = 36000,
    TWELVE_HOURS = 43200,
    ONE_DAY = 86400,
    ONE_WEEK = 604800,
    ONE_MONTH = 2592000,
    ONE_YEAR = 31536000,
    THREE_DAYS = 259200,
}
