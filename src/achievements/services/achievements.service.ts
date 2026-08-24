import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AchievementsRepository } from '../achievements.repository';
import { getPassedAchievementIds } from '../achievements.logic';
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  AchievementUnlockedEvent,
} from '../events/achievement-unlocked.event';

const PURCHASE_COUNT_GROUP_KEY = 'purchase_count';
const TOTAL_SPEND_GROUP_KEY = 'total_spend';

export interface UserAchievementsSummary {
  unlockedAchievements: string[];
  nextAvailableAchievements: string[];
}

@Injectable()
export class AchievementsService {
  constructor(
    private readonly achievementsRepository: AchievementsRepository,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  // Runs after every purchase. Checks if the user has unlocked any new achievements and updates accordingly
  async evaluateForUser(userId: string): Promise<void> {
    // Fetch everything needed at once: user's current purchase count, user's current total spend, list of all available groups, list of all available achievements, list of all unlocked achievements for the user
    const [purchaseCount, totalSpend, groups, achievements, unlockedIds] =
      await Promise.all([
        this.achievementsRepository.getUserPurchaseCount(userId),
        this.achievementsRepository.getUserTotalSpend(userId),
        this.achievementsRepository.findAllGroups(),
        this.achievementsRepository.findAllAchievementsOrdered(),
        this.achievementsRepository.findUnlockedAchievementIds(userId),
      ]);

    // Every achievement belongs to a group (purchase_count or total_spend)
    // Find out the current value for each group for the user
    const groupKeyById = new Map(groups.map((group) => [group.id, group.key]));
    const currentValueByGroup: Record<string, bigint> = {};
    for (const group of groups) {
      currentValueByGroup[group.key] = this.getGroupCurrentValue(
        group.key,
        purchaseCount,
        totalSpend,
      );
    }

    const thresholdInputs = achievements.map((achievement) => ({
      id: achievement.id,
      groupKey: groupKeyById.get(achievement.groupId) ?? '',
      threshold: BigInt(achievement.threshold),
    }));

    // Find out which achievements the user has passed the threshold for, that they haven't unlocked yet
    const passedAchievements = getPassedAchievementIds(
      thresholdInputs,
      currentValueByGroup,
      unlockedIds,
    );

    const achievementsById = new Map(
      achievements.map((achievement) => [achievement.id, achievement]),
    );

    // For each achievement the user now qualifies for, try to save it.
    // We skip it if it's already saved
    // so we never unlock the same achievement twice even if two purchases land at the same time.
    for (const achievementId of passedAchievements) {
      const inserted =
        await this.achievementsRepository.insertUnlockedAchievement(
          userId,
          achievementId,
        );
      if (inserted) {
        const achievement = achievementsById.get(achievementId)!;
        this.eventEmitter.emit(
          ACHIEVEMENT_UNLOCKED_EVENT,
          new AchievementUnlockedEvent(achievement.name, { id: userId }),
        );
      }
    }
  }

  // Count how many achievements this user has unlocked in total,
  // across every group.
  countUnlockedAchievements(userId: string): Promise<number> {
    return this.achievementsRepository.countUnlockedAchievements(userId);
  }

  // Get the user's achievements summary: achievements they've unlocked, and for each group, the very next achievement they haven't reached yet
  async getUserAchievementsSummary(
    userId: string,
  ): Promise<UserAchievementsSummary> {
    const [groups, achievements, unlockedIds] = await Promise.all([
      this.achievementsRepository.findAllGroups(),
      this.achievementsRepository.findAllAchievementsOrdered(),
      this.achievementsRepository.findUnlockedAchievementIds(userId),
    ]);

    // Group the achievements by their groupId so we can go through each
    const achievementsByGroupId = new Map<string, typeof achievements>();
    for (const achievement of achievements) {
      const list = achievementsByGroupId.get(achievement.groupId) ?? [];
      list.push(achievement);
      achievementsByGroupId.set(achievement.groupId, list);
    }

    const unlockedAchievements = achievements
      .filter((achievement) => unlockedIds.has(achievement.id))
      .map((achievement) => achievement.name);

    // For each group, pick the first achievement the user hasn't unlocked,
    const nextAvailableAchievements: string[] = [];
    for (const group of groups) {
      const groupAchievements = achievementsByGroupId.get(group.id) ?? [];
      const next = groupAchievements.find(
        (achievement) => !unlockedIds.has(achievement.id),
      );
      if (next) {
        nextAvailableAchievements.push(next.name);
      }
    }

    return { unlockedAchievements, nextAvailableAchievements };
  }

  // depending on the group we're checking, return the value
  // that is important for that group, how many purchases, or how much spent.
  private getGroupCurrentValue(
    groupKey: string,
    purchaseCount: number,
    totalSpend: bigint,
  ): bigint {
    if (groupKey === PURCHASE_COUNT_GROUP_KEY) {
      return BigInt(purchaseCount);
    }
    if (groupKey === TOTAL_SPEND_GROUP_KEY) {
      return totalSpend;
    }
    return 0n;
  }
}
