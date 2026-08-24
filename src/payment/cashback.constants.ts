export const CASHBACK_QUEUE_NAME = 'cashback';
export const CASHBACK_JOB_NAME = 'badge-cashback';
export const BADGE_CASHBACK_OUTBOX_EVENT_TYPE = 'badge.cashback';

export const BADGE_CASHBACK_AMOUNT = 3000_00n; //Korapay does not allow transfers of less than N1,000

export interface BadgeCashbackOutboxPayload {
  userId: string;
  badgeId: string;
  badgeName: string;
  amount: string;
}
