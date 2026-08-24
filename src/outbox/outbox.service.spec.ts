import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { OutboxService } from './outbox.service';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxStatus } from './enums/outbox-status.enum';

describe('OutboxService', () => {
  let service: OutboxService;
  let outboxRepository: { find: jest.Mock; update: jest.Mock; increment: jest.Mock };

  beforeEach(async () => {
    outboxRepository = {
      find: jest.fn(),
      update: jest.fn(),
      increment: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: getRepositoryToken(OutboxEvent), useValue: outboxRepository },
      ],
    }).compile();

    service = module.get<OutboxService>(OutboxService);
  });

  it('records an event using the transaction manager passed to the service ', async () => {
    const created = { eventType: 'badge.cashback', payload: { userId: 'user-1' } };
    const manager = {
      create: jest.fn().mockReturnValue(created),
      save: jest.fn(),
    } as unknown as EntityManager;

    await service.record(manager, 'badge.cashback', { userId: 'user-1' });

    expect(manager.create).toHaveBeenCalledWith(OutboxEvent, {
      eventType: 'badge.cashback',
      payload: { userId: 'user-1' },
    });
    expect(manager.save).toHaveBeenCalledWith(created);
  });

  it('finds pending events for the given type, oldest first', async () => {
    outboxRepository.find.mockResolvedValue([]);

    await service.findPending('badge.cashback');

    expect(outboxRepository.find).toHaveBeenCalledWith({
      where: { eventType: 'badge.cashback', status: OutboxStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: 20,
    });
  });

  it('marks an event dispatched with a timestamp', async () => {
    await service.markDispatched('event-1');

    expect(outboxRepository.update).toHaveBeenCalledWith('event-1', {
      status: OutboxStatus.DISPATCHED,
      dispatchedAt: expect.any(Date),
    });
  });

  it('increments the attempt count on a failed attempt', async () => {
    await service.recordFailedAttempt('event-1');

    expect(outboxRepository.increment).toHaveBeenCalledWith(
      { id: 'event-1' },
      'attempts',
      1,
    );
  });
});
