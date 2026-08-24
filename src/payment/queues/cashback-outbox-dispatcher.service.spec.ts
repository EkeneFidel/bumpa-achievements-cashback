import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { CashbackOutboxDispatcherService } from './cashback-outbox-dispatcher.service';
import { OutboxService } from '../../outbox/outbox.service';
import {
  BADGE_CASHBACK_OUTBOX_EVENT_TYPE,
  CASHBACK_JOB_NAME,
  CASHBACK_QUEUE_NAME,
} from '../cashback.constants';

// Mock pending outbox events, shaped like the real data.
const PENDING_EVENTS = [
  {
    id: 'event-1',
    payload: { userId: 'user-1', badgeId: 'badge-1', badgeName: 'Rookie', amount: '30000' },
  },
  {
    id: 'event-2',
    payload: { userId: 'user-2', badgeId: 'badge-1', badgeName: 'Rookie', amount: '30000' },
  },
];

describe('CashbackOutboxDispatcherService', () => {
  let service: CashbackOutboxDispatcherService;
  let outboxService: {
    findPending: jest.Mock;
    markDispatched: jest.Mock;
    recordFailedAttempt: jest.Mock;
  };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    outboxService = {
      findPending: jest.fn().mockResolvedValue(PENDING_EVENTS),
      markDispatched: jest.fn(),
      recordFailedAttempt: jest.fn(),
    };
    queue = { add: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashbackOutboxDispatcherService,
        { provide: OutboxService, useValue: outboxService },
        { provide: getQueueToken(CASHBACK_QUEUE_NAME), useValue: queue },
      ],
    }).compile();

    service = module.get<CashbackOutboxDispatcherService>(
      CashbackOutboxDispatcherService,
    );
  });

  describe('dispatchPending', () => {
    it('only looks at pending badge cashback events', async () => {
      await service.dispatchPending();

      expect(outboxService.findPending).toHaveBeenCalledWith(
        BADGE_CASHBACK_OUTBOX_EVENT_TYPE,
      );
    });

    it('queues each event keyed by its outbox event id and marks it dispatched', async () => {
      await service.dispatchPending();

      expect(queue.add).toHaveBeenNthCalledWith(
        1,
        CASHBACK_JOB_NAME,
        { outboxEventId: 'event-1', ...PENDING_EVENTS[0].payload },
        { jobId: 'event-1' },
      );
      expect(queue.add).toHaveBeenNthCalledWith(
        2,
        CASHBACK_JOB_NAME,
        { outboxEventId: 'event-2', ...PENDING_EVENTS[1].payload },
        { jobId: 'event-2' },
      );
      expect(outboxService.markDispatched).toHaveBeenCalledWith('event-1');
      expect(outboxService.markDispatched).toHaveBeenCalledWith('event-2');
    });

    it('records a failed attempt and still moves on to the next event when queuing fails', async () => {
      queue.add
        .mockRejectedValueOnce(new Error('redis is down'))
        .mockResolvedValueOnce(undefined);

      await service.dispatchPending();

      expect(outboxService.recordFailedAttempt).toHaveBeenCalledWith('event-1');
      expect(outboxService.markDispatched).not.toHaveBeenCalledWith('event-1');
      expect(outboxService.markDispatched).toHaveBeenCalledWith('event-2');
    });
  });

  describe('handleBadgeUnlocked and sweepPending', () => {
    it('both dispatch pending events when triggered', async () => {
      const spy = jest.spyOn(service, 'dispatchPending');

      await service.handleBadgeUnlocked();
      await service.sweepPending();

      expect(spy).toHaveBeenCalledTimes(2);
    });
  });
});
