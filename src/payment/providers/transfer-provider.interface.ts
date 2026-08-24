// The contract any 3rd-party transfer provider (Korapay, Paystack,
// Flutterwave, etc.) must implement. PaymentService only ever depends on
// this interface, never on a concrete provider - so swapping or adding a
// provider means writing a new class that implements this and pointing
// the TRANSFER_PROVIDER token at it in PaymentModule. PaymentService
// itself never changes.
export const TRANSFER_PROVIDER = 'TRANSFER_PROVIDER';

export type TransferProviderStatus = 'pending' | 'success' | 'failed' | 'reversed';

export interface InitiateTransferInput {
  amount: bigint;
  reference: string;
  reason?: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  customerEmail: string;
}

export interface InitiateTransferResult {
  transferCode: string;
  status: TransferProviderStatus;
}

export interface TransferStatusEvent {
  reference: string;
  status: TransferProviderStatus;
  transferCode: string | null;
}

export interface TransferProvider {
  readonly providerName: string;

  initiateTransfer(input: InitiateTransferInput): Promise<InitiateTransferResult>;

  verifyTransaction(reference: string): Promise<TransferStatusEvent>;
}
