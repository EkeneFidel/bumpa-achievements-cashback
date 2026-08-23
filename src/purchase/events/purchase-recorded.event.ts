export const PURCHASE_RECORDED_EVENT = 'purchase.recorded';

export class PurchaseRecordedEvent {
  constructor(
    public readonly userId: string,
    public readonly purchaseId: string,
    public readonly amountKobo: bigint,
  ) {}
}
