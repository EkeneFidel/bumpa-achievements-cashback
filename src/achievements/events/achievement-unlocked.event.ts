export const ACHIEVEMENT_UNLOCKED_EVENT = 'achievement.unlocked';

export interface AchievementUnlockedUser {
  id: string;
}

export class AchievementUnlockedEvent {
  constructor(
    public readonly achievementName: string,
    public readonly user: AchievementUnlockedUser,
  ) {}
}
