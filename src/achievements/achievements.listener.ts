import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CacheService } from '../cache/cache.service';
import {
  PURCHASE_RECORDED_EVENT,
  PurchaseRecordedEvent,
} from '../purchase/events/purchase-recorded.event';
import { AchievementsService } from './achievements.service';

const LOCK_TTL_SECONDS = 5;


@Injectable()
export class AchievementsListener {
  constructor(
    private readonly achievementsService: AchievementsService,
    private readonly cacheService: CacheService,
  ) { }

  @OnEvent(PURCHASE_RECORDED_EVENT)
  async handlePurchaseRecorded(event: PurchaseRecordedEvent): Promise<void> {
    // acquire a lock to prevent multiple instances of this handler from running for the same user at the same time
    const lockKey = `lock:user:${event.userId}:achv`;
    const acquired = await this.cacheService.acquireLock(
      lockKey,
      LOCK_TTL_SECONDS,
    );
    if (!acquired) {
      return;
    }

    try {
      await this.achievementsService.evaluateForUser(event.userId);
    } finally {
      await this.cacheService.del(lockKey);
    }
  }
}
