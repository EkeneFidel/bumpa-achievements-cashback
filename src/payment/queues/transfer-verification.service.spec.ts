import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Not } from 'typeorm';
import { TransferVerificationService } from './transfer-verification.service';
import { PaymentService } from '../services/payment.service';
import { Transfer } from '../entities/transfer.entity';
import { TransferStatus } from '../enums/transfer-status.enum';
import { TRANSFER_PROVIDER } from '../providers/transfer-provider.interface';

// Mock pending transfers, shaped like the real data. Both already have a
// transferCode, meaning the transfer provider actually accepted them.
const PENDING_TRANSFERS = [
  { id: 'transfer-1', reference: 'txf_1', transferCode: 'txf_1' },
  { id: 'transfer-2', reference: 'txf_2', transferCode: 'txf_2' },
];

describe('TransferVerificationService', () => {
  let service: TransferVerificationService;
  let transferRepository: { find: jest.Mock };
  let transferProvider: { verifyTransaction: jest.Mock };
  let paymentService: { recordTransferStatus: jest.Mock };

  beforeEach(async () => {
    transferRepository = { find: jest.fn().mockResolvedValue(PENDING_TRANSFERS) };
    transferProvider = { verifyTransaction: jest.fn().mockResolvedValue({}) };
    paymentService = { recordTransferStatus: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferVerificationService,
        { provide: getRepositoryToken(Transfer), useValue: transferRepository },
        { provide: TRANSFER_PROVIDER, useValue: transferProvider },
        { provide: PaymentService, useValue: paymentService },
      ],
    }).compile();

    service = module.get<TransferVerificationService>(TransferVerificationService);
  });

  it('only looks at pending transfers the provider has actually acknowledged', async () => {
    await service.verifyPending();

    expect(transferRepository.find).toHaveBeenCalledWith({
      where: { status: TransferStatus.PENDING, transferCode: Not(IsNull()) },
    });
  });

  it('verifies every pending transfer and applies whatever status comes back', async () => {
    const eventOne = { reference: 'txf_1', status: 'success', transferCode: 'txf_1' };
    const eventTwo = { reference: 'txf_2', status: 'failed', transferCode: 'txf_2' };
    transferProvider.verifyTransaction
      .mockResolvedValueOnce(eventOne)
      .mockResolvedValueOnce(eventTwo);

    await service.verifyPending();

    expect(transferProvider.verifyTransaction).toHaveBeenCalledWith('txf_1');
    expect(transferProvider.verifyTransaction).toHaveBeenCalledWith('txf_2');
    expect(paymentService.recordTransferStatus).toHaveBeenCalledWith(eventOne);
    expect(paymentService.recordTransferStatus).toHaveBeenCalledWith(eventTwo);
  });

  it('keeps checking the rest of the list when one verification fails', async () => {
    transferProvider.verifyTransaction
      .mockRejectedValueOnce(new Error('korapay is down'))
      .mockResolvedValueOnce({ reference: 'txf_2', status: 'success', transferCode: 'txf_2' });

    await service.verifyPending();

    expect(paymentService.recordTransferStatus).toHaveBeenCalledTimes(1);
    expect(paymentService.recordTransferStatus).toHaveBeenCalledWith(
      expect.objectContaining({ reference: 'txf_2' }),
    );
  });
});
