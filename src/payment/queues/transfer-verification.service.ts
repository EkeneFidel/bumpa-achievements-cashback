import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentService } from '../services/payment.service';
import { Transfer } from '../entities/transfer.entity';
import { TransferStatus } from '../enums/transfer-status.enum';
import { TRANSFER_PROVIDER } from '../providers/transfer-provider.interface';
import type { TransferProvider } from '../providers/transfer-provider.interface';

// There is no webhook - instead, every still-pending transfer is
// re-checked against the provider's transaction endpoint on a schedule.
@Injectable()
export class TransferVerificationService {
  private readonly logger = new Logger(TransferVerificationService.name);

  constructor(
    @InjectRepository(Transfer)
    private readonly transferRepository: Repository<Transfer>,
    @Inject(TRANSFER_PROVIDER)
    private readonly transferProvider: TransferProvider,
    private readonly paymentService: PaymentService,
  ) { }

  @Cron("0 */2 * * * *")
  async verifyPending(): Promise<void> {

    const pending = await this.transferRepository.find({
      where: { status: TransferStatus.PENDING, transferCode: Not(IsNull()) },
    });


    for (const transfer of pending) {
      try {
        const event = await this.transferProvider.verifyTransaction(
          transfer.reference,
        );
        await this.paymentService.recordTransferStatus(event);
      } catch (error) {
        this.logger.error(
          `Failed to verify transfer ${transfer.reference}`,
          error instanceof Error ? error.stack : error,
        );
      }
    }
  }
}
