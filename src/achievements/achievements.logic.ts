export interface AchievementThresholdInput {
  id: string;
  groupKey: string;
  threshold: bigint;
}

export function getPassedAchievementIds(
  achievements: AchievementThresholdInput[],
  currentValueByGroup: Readonly<Record<string, bigint>>,
  alreadyUnlockedIds: ReadonlySet<string>,
): string[] {
  return achievements
    .filter((achievement) => !alreadyUnlockedIds.has(achievement.id))
    .filter(
      (achievement) =>
        (currentValueByGroup[achievement.groupKey] ?? 0n) >=
        achievement.threshold,
    )
    .map((achievement) => achievement.id);
}
