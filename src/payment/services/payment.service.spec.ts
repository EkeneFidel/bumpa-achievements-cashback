import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { UserService } from '../../user/services/user.service';
import { Transfer } from '../entities/transfer.entity';
import { TransferStatus } from '../enums/transfer-status.enum';
import { TRANSFER_PROVIDER } from '../providers/transfer-provider.interface';

const mockUser = () => ({
  id: 'user-1',
  name: 'Ekene Chukwurah',
  email: 'ekene@mailinator.com',
  bankAccountNumber: '0000000000',
  bankCode: '033',
});

describe('PaymentService', () => {
  let service: PaymentService;
  let userService: { findById: jest.Mock };
  let transferProvider: { initiateTransfer: jest.Mock };
  let transferRepository: {
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: { findOne: jest.Mock; save: jest.Mock };
  };

  beforeEach(async () => {
    userService = { findById: jest.fn() };
    transferProvider = { initiateTransfer: jest.fn() };
    transferRepository = {
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      save: jest.fn(async (entity) => ({ ...entity })),
      create: jest.fn((data) => data),
    };
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(async (entity) => entity),
      },
    };
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: TRANSFER_PROVIDER, useValue: transferProvider },
        { provide: UserService, useValue: userService },
        { provide: getRepositoryToken(Transfer), useValue: transferRepository },
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  describe('initiateTransfer', () => {
    it('rejects a user that does not exist', async () => {
      userService.findById.mockResolvedValue(null);

      await expect(
        service.initiateTransfer('missing-user', 300_00n),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a user with no bank account saved', async () => {
      userService.findById.mockResolvedValue({ ...mockUser(), bankAccountNumber: '' });

      await expect(service.initiateTransfer('user-1', 300_00n)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a pending transfer, sends it to the provider, and saves the result', async () => {
      userService.findById.mockResolvedValue(mockUser());
      transferRepository.findOne.mockResolvedValue(null);
      transferProvider.initiateTransfer.mockResolvedValue({
        transferCode: 'txf_provider_1',
        status: 'success',
      });

      const transfer = await service.initiateTransfer('user-1', 300_00n, 'Badge cashback');

      expect(transferRepository.save).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ userId: 'user-1', status: TransferStatus.PENDING }),
      );
      expect(transferProvider.initiateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 300_00n,
          reason: 'Badge cashback',
          bankCode: mockUser().bankCode,
          accountNumber: mockUser().bankAccountNumber,
          accountName: mockUser().name,
          customerEmail: mockUser().email,
        }),
      );
      expect(transfer.status).toBe(TransferStatus.SUCCESS);
      expect(transfer.transferCode).toBe('txf_provider_1');
    });

    it('does not call the provider again once it already accepted the transfer', async () => {
      userService.findById.mockResolvedValue(mockUser());
      transferRepository.findOne.mockResolvedValue({
        id: 'transfer-1',
        reference: 'txf_event-1',
        transferCode: 'txf_provider_1',
        status: TransferStatus.SUCCESS,
      });

      const transfer = await service.initiateTransfer(
        'user-1',
        300_00n,
        'Badge cashback',
        'event-1',
      );

      expect(transferProvider.initiateTransfer).not.toHaveBeenCalled();
      expect(transfer.transferCode).toBe('txf_provider_1');
    });

    it('retries the provider call when a previous attempt never reached it', async () => {
      userService.findById.mockResolvedValue(mockUser());
      // A row was already created from a previous attempt, but the provider was never
      // successfully called therefore it has no transferCode yet.
      transferRepository.findOne.mockResolvedValue({
        id: 'transfer-1',
        reference: 'txf_event-1',
        transferCode: null,
        status: TransferStatus.PENDING,
      });
      transferProvider.initiateTransfer.mockResolvedValue({
        transferCode: 'txf_provider_1',
        status: 'success',
      });

      await service.initiateTransfer('user-1', 300_00n, 'Badge cashback', 'event-1');

      // The existing row is reused, not recreated.
      expect(transferRepository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ reference: 'txf_event-1', status: TransferStatus.PENDING }),
      );
      expect(transferProvider.initiateTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ reference: 'txf_event-1' }),
      );
    });

    it('reuses the row another concurrent attempt just created, instead of failing', async () => {
      userService.findById.mockResolvedValue(mockUser());
      transferRepository.findOne
        .mockResolvedValueOnce(null) // nothing found yet when we look first
        .mockResolvedValueOnce(undefined); // unused
      transferRepository.findOneOrFail.mockResolvedValue({
        id: 'transfer-1',
        reference: 'txf_event-1',
        transferCode: null,
        status: TransferStatus.PENDING,
      });
      transferRepository.save.mockImplementationOnce(async () => {
        throw { code: '23505' };
      });
      transferProvider.initiateTransfer.mockResolvedValue({
        transferCode: 'txf_provider_1',
        status: 'success',
      });

      const transfer = await service.initiateTransfer(
        'user-1',
        300_00n,
        'Badge cashback',
        'event-1',
      );

      expect(transferRepository.findOneOrFail).toHaveBeenCalledWith({
        where: { reference: 'txf_event-1' },
      });
      expect(transfer.status).toBe(TransferStatus.SUCCESS);
    });
  });

  describe('recordTransferStatus', () => {
    it('applies the new status to a pending transfer and commits', async () => {
      const transfer = {
        id: 'transfer-1',
        reference: 'txf_1',
        status: TransferStatus.PENDING,
        transferCode: 'txf_provider_1',
      };
      queryRunner.manager.findOne.mockResolvedValue(transfer);

      await service.recordTransferStatus({
        reference: 'txf_1',
        status: 'success',
        transferCode: 'txf_provider_1',
      });

      expect(queryRunner.manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: TransferStatus.SUCCESS }),
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('does nothing when no transfer matches the reference', async () => {
      queryRunner.manager.findOne.mockResolvedValue(null);

      await service.recordTransferStatus({
        reference: 'no-such-reference',
        status: 'success',
        transferCode: null,
      });

      expect(queryRunner.manager.save).not.toHaveBeenCalled();
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
    });

    it('does not apply a status twice once the transfer already settled', async () => {
      queryRunner.manager.findOne.mockResolvedValue({
        id: 'transfer-1',
        reference: 'txf_1',
        status: TransferStatus.SUCCESS,
      });

      await service.recordTransferStatus({
        reference: 'txf_1',
        status: 'failed',
        transferCode: null,
      });

      expect(queryRunner.manager.save).not.toHaveBeenCalled();
    });

    it('rolls back and rethrows when saving the update fails', async () => {
      queryRunner.manager.findOne.mockResolvedValue({
        id: 'transfer-1',
        reference: 'txf_1',
        status: TransferStatus.PENDING,
      });
      queryRunner.manager.save.mockRejectedValue(new Error('db is down'));

      await expect(
        service.recordTransferStatus({
          reference: 'txf_1',
          status: 'success',
          transferCode: null,
        }),
      ).rejects.toThrow('db is down');

      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });
  });
});
