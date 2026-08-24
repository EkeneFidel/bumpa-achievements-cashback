import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InitiateTransferInput,
  InitiateTransferResult,
  TransferProvider,
  TransferProviderStatus,
  TransferStatusEvent,
} from './transfer-provider.interface';

const STATUS_MAP: Record<string, TransferProviderStatus> = {
  processing: 'pending',
  pending: 'pending',
  success: 'success',
  failed: 'failed',
  reversed: 'reversed',
};

@Injectable()
export class KorapayTransferProvider implements TransferProvider {
  readonly providerName = 'korapay';

  private readonly logger = new Logger(KorapayTransferProvider.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>('KORAPAY_BASE_URL') ??
      'https://api.korapay.com';
    this.secretKey = this.configService.getOrThrow<string>(
      'KORAPAY_SECRET_KEY',
    );
  }

  async initiateTransfer(
    input: InitiateTransferInput,
  ): Promise<InitiateTransferResult> {
    const response = await this.request<{ reference: string; status: string }>(
      'POST',
      '/merchant/api/v1/transactions/disburse',
      {
        reference: input.reference,
        destination: {
          type: 'bank_account',
          amount: Number(input.amount) / 100,
          currency: 'NGN',
          narration: input.reason,
          bank_account: {
            bank: input.bankCode,
            account: input.accountNumber,
          },
          customer: {
            name: input.accountName,
            email: input.customerEmail,
          },
        },
      },
    );

    return {
      transferCode: response.reference,
      status: STATUS_MAP[response.status] ?? 'pending',
    };
  }

  async verifyTransaction(reference: string): Promise<TransferStatusEvent> {
    const response = await this.request<{ reference: string; status: string }>(
      'GET',
      `/merchant/api/v1/transactions/${reference}`,
    );

    return {
      reference: response.reference,
      status: STATUS_MAP[response.status] ?? 'pending',
      transferCode: response.reference,
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await response.json()) as {
      status: boolean;
      message: string;
      data?: T;
    };
    if (!response.ok || !json.status || !json.data) {
      this.logger.error(`Korapay request to ${path} failed: ${json.message}`);
      throw new ServiceUnavailableException(
        json.message ?? 'Korapay request failed',
      );
    }
    return json.data;
  }
}
