export const BADGE_UNLOCKED_EVENT = 'badge.unlocked';

export interface BadgeUnlockedUser {
  id: string;
}

export class BadgeUnlockedEvent {
  constructor(
    public readonly badgeName: string,
    public readonly user: BadgeUnlockedUser,
    public readonly userBadgeId: string,
  ) {}
}
