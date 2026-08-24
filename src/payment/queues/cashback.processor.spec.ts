import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { CashbackProcessor } from './cashback.processor';
import { PaymentService } from '../services/payment.service';

describe('CashbackProcessor', () => {
  let processor: CashbackProcessor;
  let paymentService: { initiateTransfer: jest.Mock };

  beforeEach(async () => {
    paymentService = { initiateTransfer: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashbackProcessor,
        { provide: PaymentService, useValue: paymentService },
      ],
    }).compile();

    processor = module.get<CashbackProcessor>(CashbackProcessor);
  });

  it('pays the cashback for the job, using the outbox event id as the idempotency key', async () => {
    const job = {
      data: {
        outboxEventId: 'event-1',
        userId: 'user-1',
        badgeName: 'Rookie',
        amount: '30000',
      },
    } as unknown as Job;

    await processor.process(job);

    expect(paymentService.initiateTransfer).toHaveBeenCalledWith(
      'user-1',
      30000n,
      'Badge unlocked cashback: Rookie',
      'event-1',
    );
  });
});
