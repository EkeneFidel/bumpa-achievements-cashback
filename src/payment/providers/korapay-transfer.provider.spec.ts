import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KorapayTransferProvider } from './korapay-transfer.provider';

const BASE_URL = 'https://api.korapay.com';

// A fake fetch Response with just the part of the response the provider reads.
function fakeResponse(ok: boolean, body: unknown) {
  return { ok, json: jest.fn().mockResolvedValue(body) } as unknown as Response;
}

const TRANSFER_INPUT = {
  amount: 300_00n,
  reference: 'txf_1',
  reason: 'Badge unlocked cashback: Rookie',
  bankCode: '033',
  accountNumber: '0000000000',
  accountName: 'Test User',
  customerEmail: 'test@mailinator.com',
};

describe('KorapayTransferProvider', () => {
  let provider: KorapayTransferProvider;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const configService = {
      get: jest.fn().mockReturnValue(BASE_URL),
      getOrThrow: jest.fn().mockReturnValue('test-secret-key'),
    };

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KorapayTransferProvider,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    provider = module.get<KorapayTransferProvider>(KorapayTransferProvider);
  });

  describe('initiateTransfer', () => {
    it('sends the payout to Korapay with the amount in naira, not kobo', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse(true, {
          status: true,
          message: 'ok',
          data: { reference: 'txf_1', status: 'processing' },
        }),
      );

      await provider.initiateTransfer(TRANSFER_INPUT);

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/merchant/api/v1/transactions/disburse`);
      expect(options.method).toBe('POST');
      expect(options.headers.Authorization).toBe('Bearer test-secret-key');

      const body = JSON.parse(options.body);
      expect(body.reference).toBe('txf_1');
      expect(body.destination.amount).toBe(300);
      expect(body.destination.currency).toBe('NGN');
      expect(body.destination.bank_account).toEqual({ bank: '033', account: '0000000000' });
      expect(body.destination.customer).toEqual({
        name: 'Test User',
        email: 'test@mailinator.com',
      });
    });

    it('maps the response status if the transfer is still processing to pending', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse(true, {
          status: true,
          message: 'ok',
          data: { reference: 'txf_1', status: 'processing' },
        }),
      );

      const result = await provider.initiateTransfer(TRANSFER_INPUT);

      expect(result).toEqual({ transferCode: 'txf_1', status: 'pending' });
    });

    it('maps an immediate success response', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse(true, {
          status: true,
          message: 'ok',
          data: { reference: 'txf_1', status: 'success' },
        }),
      );

      const result = await provider.initiateTransfer(TRANSFER_INPUT);

      expect(result).toEqual({ transferCode: 'txf_1', status: 'success' });
    });

    it('throws when Korapay rejects the request', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse(false, { status: false, message: 'insufficient balance' }),
      );

      await expect(provider.initiateTransfer(TRANSFER_INPUT)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('verifyTransaction', () => {
    it('looks up the transaction by reference', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse(true, {
          status: true,
          message: 'ok',
          data: { reference: 'txf_1', status: 'success' },
        }),
      );

      const result = await provider.verifyTransaction('txf_1');

      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/merchant/api/v1/transactions/txf_1`);
      expect(options.method).toBe('GET');
      expect(result).toEqual({
        reference: 'txf_1',
        status: 'success',
        transferCode: 'txf_1',
      });
    });

    it('throws when the lookup fails', async () => {
      fetchMock.mockResolvedValue(
        fakeResponse(false, { status: false, message: 'not found' }),
      );

      await expect(provider.verifyTransaction('txf_missing')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
