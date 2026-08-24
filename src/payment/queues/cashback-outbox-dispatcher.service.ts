import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxService } from '../../outbox/outbox.service';
import { BADGE_UNLOCKED_EVENT } from '../../badges/events/badge-unlocked.event';
import {
  BADGE_CASHBACK_OUTBOX_EVENT_TYPE,
  CASHBACK_JOB_NAME,
  CASHBACK_QUEUE_NAME,
} from '../cashback.constants';


@Injectable()
export class CashbackOutboxDispatcherService {
  private readonly logger = new Logger(CashbackOutboxDispatcherService.name);

  constructor(
    private readonly outboxService: OutboxService,
    @InjectQueue(CASHBACK_QUEUE_NAME) private readonly cashbackQueue: Queue,
  ) { }

  // When a badge is unlocked, dispatch pending cashback outbox events.
  @OnEvent(BADGE_UNLOCKED_EVENT)
  async handleBadgeUnlocked(): Promise<void> {
    await this.dispatchPending();
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepPending(): Promise<void> {
    await this.dispatchPending();
  }

  // It takes all pending cashback outbox events and moves them to the
  // queue and then marks them as dispatched.
  async dispatchPending(): Promise<void> {
    const pending = await this.outboxService.findPending(
      BADGE_CASHBACK_OUTBOX_EVENT_TYPE,
    );

    for (const event of pending) {
      try {
        await this.cashbackQueue.add(
          CASHBACK_JOB_NAME,
          { outboxEventId: event.id, ...event.payload },
          { jobId: event.id },
        );
        await this.outboxService.markDispatched(event.id);
      } catch (error) {
        this.logger.error(
          `Failed to queue cashback outbox event ${event.id}`,
          error instanceof Error ? error.stack : error,
        );
        await this.outboxService.recordFailedAttempt(event.id);
      }
    }
  }
}
