import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AchievementsService } from '../../achievements/services/achievements.service';
import { OutboxService } from '../../outbox/outbox.service';
import {
  BADGE_CASHBACK_OUTBOX_EVENT_TYPE,
  BADGE_CASHBACK_AMOUNT,
  BadgeCashbackOutboxPayload,
} from '../../payment/cashback.constants';
import { BadgesRepository } from '../badges.repository';
import { getHighestEligibleBadge } from '../badges.logic';
import {
  BADGE_UNLOCKED_EVENT,
  BadgeUnlockedEvent,
} from '../events/badge-unlocked.event';

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
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
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

    // Awarding the badge and recording that a cashback is owed for it
    // happen in the same transaction, so the cashback can never be lost
    // even if the process crashes right after this.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let userBadgeId: string | null;
    try {
      userBadgeId = await this.badgesRepository.insertUserBadge(
        userId,
        eligibleBadge.id,
        queryRunner.manager,
      );

      if (userBadgeId) {
        const payload: BadgeCashbackOutboxPayload = {
          userId,
          badgeId: eligibleBadge.id,
          badgeName: eligibleBadge.name,
          amount: BADGE_CASHBACK_AMOUNT.toString(),
        };
        await this.outboxService.record(
          queryRunner.manager,
          BADGE_CASHBACK_OUTBOX_EVENT_TYPE,
          payload as unknown as Record<string, unknown>,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

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
