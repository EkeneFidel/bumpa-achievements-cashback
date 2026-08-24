import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { PaymentService } from './payment.service';
import { UserService } from '../../user/services/user.service';
import { Transfer } from '../entities/transfer.entity';
import { TRANSFER_PROVIDER } from '../providers/transfer-provider.interface';

describe('PaymentService', () => {
  let service: PaymentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: TRANSFER_PROVIDER, useValue: {} },
        { provide: UserService, useValue: {} },
        { provide: getRepositoryToken(Transfer), useValue: {} },
        { provide: getDataSourceToken(), useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
