import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { UserService } from '../../user/services/user.service';
import { Transfer } from '../entities/transfer.entity';
import { TransferStatus } from '../enums/transfer-status.enum';
import { TRANSFER_PROVIDER } from '../providers/transfer-provider.interface';
import type {
  TransferProvider,
  TransferProviderStatus,
  TransferStatusEvent,
} from '../providers/transfer-provider.interface';

const STATUS_MAP: Record<TransferProviderStatus, TransferStatus> = {
  pending: TransferStatus.PENDING,
  success: TransferStatus.SUCCESS,
  failed: TransferStatus.FAILED,
  reversed: TransferStatus.REVERSED,
};



@Injectable()
export class PaymentService {
  constructor(
    @Inject(TRANSFER_PROVIDER)
    private readonly transferProvider: TransferProvider,
    private readonly userService: UserService,
    @InjectRepository(Transfer)
    private readonly transferRepository: Repository<Transfer>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) { }

  // Generate a reference and initiate the transfer to the user's bank
  // account.
  async initiateTransfer(
    userId: string,
    amount: bigint,
    reason?: string,
    idempotencyKey?: string,
  ): Promise<Transfer> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.bankAccountNumber || !user.bankCode) {
      throw new BadRequestException('User has no bank account on file');
    }

    const reference = idempotencyKey
      ? `txf_${idempotencyKey}`
      : `txf_${randomUUID()}`;

    let transfer: Transfer | null = idempotencyKey
      ? await this.transferRepository.findOne({ where: { reference } })
      : null;

    // A transferCode means the provider already accepted this transfer on
    // a previous attempt, nothing left to retry.
    if (transfer?.transferCode) {
      return transfer;
    }

    if (!transfer) {
      // Saved as pending before calling the provider, so we still have a
      // record of the attempt even if the call fails.
      try {
        transfer = await this.transferRepository.save(
          this.transferRepository.create({
            userId: user.id,
            reference,
            amount,
            status: TransferStatus.PENDING,
          }),
        );
      } catch (error) {
        if (idempotencyKey && (error as any)?.code === '23505') {
          transfer = await this.transferRepository.findOneOrFail({
            where: { reference },
          });
        } else {
          throw error;
        }
      }
    }

    // Either the first attempt for this transfer, or a retry after a
    // previous attempt failed before the provider accepted it.
    const result = await this.transferProvider.initiateTransfer({
      amount,
      reference,
      reason,
      bankCode: user.bankCode,
      accountNumber: user.bankAccountNumber,
      accountName: user.name,
      customerEmail: user.email,
    });


    transfer.status = STATUS_MAP[result.status];
    transfer.transferCode = result.transferCode;
    await this.transferRepository.save(transfer);

    return transfer;
  }

  // Applies a transfer status looked up from the provider (via
  // verifyTransaction). Locks the row and only applies the update if the
  // transfer is still pending, so a status can never be applied twice.
  async recordTransferStatus(event: TransferStatusEvent): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const transfer = await queryRunner.manager.findOne(Transfer, {
        where: { reference: event.reference },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transfer) {
        await queryRunner.commitTransaction();
        return;
      }

      if (transfer.status !== TransferStatus.PENDING) {
        await queryRunner.commitTransaction();
        return;
      }

      transfer.status = STATUS_MAP[event.status];
      transfer.transferCode = event.transferCode ?? transfer.transferCode;
      await queryRunner.manager.save(transfer);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
