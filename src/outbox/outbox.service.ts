import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { OutboxEvent } from './entities/outbox-event.entity';
import { OutboxStatus } from './enums/outbox-status.enum';

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepository: Repository<OutboxEvent>,
  ) { }


  async record(
    manager: EntityManager,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await manager.save(manager.create(OutboxEvent, { eventType, payload }));
  }

  findPending(eventType: string, limit = 20): Promise<OutboxEvent[]> {
    return this.outboxRepository.find({
      where: { eventType, status: OutboxStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  async markDispatched(id: string): Promise<void> {
    await this.outboxRepository.update(id, {
      status: OutboxStatus.DISPATCHED,
      dispatchedAt: new Date(),
    });
  }

  async recordFailedAttempt(id: string): Promise<void> {
    await this.outboxRepository.increment({ id }, 'attempts', 1);
  }
}
