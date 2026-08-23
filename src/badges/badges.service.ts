import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AchievementsService } from '../achievements/achievements.service';
import { BadgesRepository } from './badges.repository';
import { getHighestEligibleBadge } from './badges.logic';
import {
  BADGE_UNLOCKED_EVENT,
  BadgeUnlockedEvent,
} from './events/badge-unlocked.event';

export interface UserBadgeStatus {
  currentBadge: string | null;
  nextBadge: string | null;
  remainingToUnlockNextBadge: number;
}

@Injectable()
export class BadgesService {
  constructor(
    private readonly badgesRepository: BadgesRepository,
    @Inject(forwardRef(() => AchievementsService))
    private readonly achievementsService: AchievementsService,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  // Runs whenever a new achievement has been unlocked for a user.
  // Checks if the user now qualifies for a badge
  async evaluateForUser(userId: string): Promise<void> {
    const [achievementCount, badges] = await Promise.all([
      this.achievementsService.countUnlockedAchievements(userId),
      this.badgesRepository.findAllOrderedByRequirement(),
    ]);

    // Find the highest badge the user's achievement count can reach.
    // If no badge is reachable yet, return nothing.
    const eligibleBadge = getHighestEligibleBadge(badges, achievementCount);
    if (!eligibleBadge) {
      return;
    }

    // Try to save the badge for this user. If the user already has this badge, the database ignores it
    const userBadgeId = await this.badgesRepository.insertUserBadge(
      userId,
      eligibleBadge.id,
    );

    if (userBadgeId) {
      this.eventEmitter.emit(
        BADGE_UNLOCKED_EVENT,
        new BadgeUnlockedEvent(eligibleBadge.name, { id: userId }, userBadgeId),
      );
    }
  }

  // Generates the users badge summary
  // (current badge, next badge and how many more achievements needed to unlock the next badge)
  async getUserBadgeStatus(userId: string): Promise<UserBadgeStatus> {
    const [allBadges, currentBadge, achievementCount] = await Promise.all([
      this.badgesRepository.findAllOrderedByRequirement(),
      this.badgesRepository.findUserHighestBadge(userId),
      this.achievementsService.countUnlockedAchievements(userId),
    ]);

    // If the user has never earned a badge before, treat it as being below
    //everything (-1), so the very first badge becomes the "next" one.
    const currentRequirement = currentBadge?.achievementsRequired ?? -1;
    const nextBadge =
      allBadges.find(
        (badge) => badge.achievementsRequired > currentRequirement,
      ) ?? null;

    return {
      currentBadge: currentBadge?.name ?? null,
      nextBadge: nextBadge?.name ?? null,
      remainingToUnlockNextBadge: nextBadge
        ? Math.max(nextBadge.achievementsRequired - achievementCount, 0)
        : 0,
    };
  }
}
