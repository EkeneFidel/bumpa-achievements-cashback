export interface BadgeTierInput {
  id: string;
  achievementsRequired: number;
}

// this is a function that returns the highest eligible badge for a user by checking the number of achievements the user has unlocked
export function getHighestEligibleBadge<T extends BadgeTierInput>(
  badges: T[],
  unlockedAchievementCount: number,
): T | null {
  return badges
    .filter((badge) => badge.achievementsRequired <= unlockedAchievementCount)
    .reduce<T | null>(
      (highest, badge) =>
        !highest || badge.achievementsRequired > highest.achievementsRequired
          ? badge
          : highest,
      null,
    );
}
