import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PaymentService } from '../services/payment.service';
import { CASHBACK_QUEUE_NAME } from '../cashback.constants';

interface CashbackJobData {
  outboxEventId: string;
  userId: string;
  badgeName: string;
  amount: string;
}

@Processor(CASHBACK_QUEUE_NAME)
export class CashbackProcessor extends WorkerHost {
  constructor(private readonly paymentService: PaymentService) {
    super();
  }

  async process(job: Job<CashbackJobData>): Promise<void> {
    const { outboxEventId, userId, badgeName, amount } = job.data;

    await this.paymentService.initiateTransfer(
      userId,
      BigInt(amount),
      `Badge unlocked cashback: ${badgeName}`,
      outboxEventId,
    );
  }
}
