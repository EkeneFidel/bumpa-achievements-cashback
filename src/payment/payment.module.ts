import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { UserModule } from '../user/user.module';
import { OutboxModule } from '../outbox/outbox.module';
import { PaymentService } from './services/payment.service';
import { PaymentController } from './controllers/payment.controller';
import { Transfer } from './entities/transfer.entity';
import { KorapayTransferProvider } from './providers/korapay-transfer.provider';
import { TRANSFER_PROVIDER } from './providers/transfer-provider.interface';
import { CashbackProcessor } from './queues/cashback.processor';
import { CashbackOutboxDispatcherService } from './queues/cashback-outbox-dispatcher.service';
import { TransferVerificationService } from './queues/transfer-verification.service';
import { CASHBACK_QUEUE_NAME } from './cashback.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transfer]),
    UserModule,
    OutboxModule,
    BullModule.registerQueue({
      name: CASHBACK_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    }),
  ],
  controllers: [PaymentController],
  providers: [
    PaymentService,
    KorapayTransferProvider,
    { provide: TRANSFER_PROVIDER, useExisting: KorapayTransferProvider },
    CashbackProcessor,
    CashbackOutboxDispatcherService,
    TransferVerificationService,
  ],
})
export class PaymentModule { }
