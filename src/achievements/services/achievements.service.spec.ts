import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AchievementsService } from '../services/achievements.service';
import { AchievementsRepository } from '../achievements.repository';
import { ACHIEVEMENT_UNLOCKED_EVENT } from '../events/achievement-unlocked.event';

// Mock groups and achievements, shaped like the real data,
const GROUPS = [
  { id: 'group-purchase-count', key: 'purchase_count' },
  { id: 'group-total-spend', key: 'total_spend' },
];

const ACHIEVEMENTS = [
  {
    id: 'achv-first-purchase',
    groupId: 'group-purchase-count',
    name: 'First Purchase',
    threshold: 1n,
  },
  {
    id: 'achv-5-purchases',
    groupId: 'group-purchase-count',
    name: '5 Purchases',
    threshold: 5n,
  },
  {
    id: 'achv-10-purchases',
    groupId: 'group-purchase-count',
    name: '10 Purchases',
    threshold: 10n,
  },
  {
    id: 'achv-big-spender',
    groupId: 'group-total-spend',
    name: 'Big Spender',
    threshold: 2_000_000n,
  },
  {
    id: 'achv-power-buyer',
    groupId: 'group-total-spend',
    name: 'Power Buyer',
    threshold: 5_000_000n,
  },
];

describe('AchievementsService', () => {
  let service: AchievementsService;
  let repository: {
    getUserPurchaseCount: jest.Mock;
    getUserTotalSpend: jest.Mock;
    findAllGroups: jest.Mock;
    findAllAchievementsOrdered: jest.Mock;
    findUnlockedAchievementIds: jest.Mock;
    countUnlockedAchievements: jest.Mock;
    insertUnlockedAchievement: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(async () => {
    repository = {
      getUserPurchaseCount: jest.fn(),
      getUserTotalSpend: jest.fn(),
      findAllGroups: jest.fn().mockResolvedValue(GROUPS),
      findAllAchievementsOrdered: jest.fn().mockResolvedValue(ACHIEVEMENTS),
      findUnlockedAchievementIds: jest.fn(),
      countUnlockedAchievements: jest.fn(),
      insertUnlockedAchievement: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AchievementsService,
        { provide: AchievementsRepository, useValue: repository },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AchievementsService>(AchievementsService);
  });


  describe('evaluateForUser', () => {
    it('unlocks every achievement whose threshold has been passed and emits an event for each', async () => {
      repository.getUserPurchaseCount.mockResolvedValue(5);
      repository.getUserTotalSpend.mockResolvedValue(0n);
      repository.findUnlockedAchievementIds.mockResolvedValue(new Set());
      repository.insertUnlockedAchievement.mockResolvedValue(true);

      await service.evaluateForUser('user-1');

      // Only "First Purchase" (1) and "5 Purchases" (5) are passed at a
      // purchase count of 5. "10 Purchases" and the spend achievements are not.
      expect(repository.insertUnlockedAchievement).toHaveBeenCalledTimes(2);
      expect(repository.insertUnlockedAchievement).toHaveBeenCalledWith(
        'user-1',
        'achv-first-purchase',
      );
      expect(repository.insertUnlockedAchievement).toHaveBeenCalledWith(
        'user-1',
        'achv-5-purchases',
      );

      expect(eventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ACHIEVEMENT_UNLOCKED_EVENT,
        expect.objectContaining({
          achievementName: 'First Purchase',
          user: { id: 'user-1' },
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        ACHIEVEMENT_UNLOCKED_EVENT,
        expect.objectContaining({
          achievementName: '5 Purchases',
          user: { id: 'user-1' },
        }),
      );
    });

    it('does not try to unlock an achievement the user has already unlocked', async () => {
      repository.getUserPurchaseCount.mockResolvedValue(5);
      repository.getUserTotalSpend.mockResolvedValue(0n);
      // "First Purchase" is already unlocked.
      repository.findUnlockedAchievementIds.mockResolvedValue(
        new Set(['achv-first-purchase']),
      );
      repository.insertUnlockedAchievement.mockResolvedValue(true);

      await service.evaluateForUser('user-1');

      // Only the newly-passed "5 Purchases" achievement should be attempted.
      expect(repository.insertUnlockedAchievement).toHaveBeenCalledTimes(1);
      expect(repository.insertUnlockedAchievement).toHaveBeenCalledWith(
        'user-1',
        'achv-5-purchases',
      );
    });

    it('does not emit an event when the user already has the achievement', async () => {
      repository.getUserPurchaseCount.mockResolvedValue(1);
      repository.getUserTotalSpend.mockResolvedValue(0n);
      repository.findUnlockedAchievementIds.mockResolvedValue(new Set());
      repository.insertUnlockedAchievement.mockResolvedValue(false);

      await service.evaluateForUser('user-1');

      expect(repository.insertUnlockedAchievement).toHaveBeenCalledWith(
        'user-1',
        'achv-first-purchase',
      );
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('unlocks spend-based achievements once total spend passes their threshold', async () => {
      repository.getUserPurchaseCount.mockResolvedValue(0);
      repository.getUserTotalSpend.mockResolvedValue(2_000_000n);
      repository.findUnlockedAchievementIds.mockResolvedValue(new Set());
      repository.insertUnlockedAchievement.mockResolvedValue(true);

      await service.evaluateForUser('user-1');

      expect(repository.insertUnlockedAchievement).toHaveBeenCalledTimes(1);
      expect(repository.insertUnlockedAchievement).toHaveBeenCalledWith(
        'user-1',
        'achv-big-spender',
      );
    });
  });


  describe('getUserAchievementsSummary', () => {
    // Example a user has unlocked "First Purchase" and
    // "5 Purchases" only.
    it('returns only the unlocked achievements and the single next achievement per group', async () => {
      repository.findAllGroups.mockResolvedValue(GROUPS);
      repository.findAllAchievementsOrdered.mockResolvedValue(ACHIEVEMENTS);
      repository.findUnlockedAchievementIds.mockResolvedValue(
        new Set(['achv-first-purchase', 'achv-5-purchases']),
      );

      const summary = await service.getUserAchievementsSummary('user-1');

      expect(summary.unlockedAchievements).toEqual([
        'First Purchase',
        '5 Purchases',
      ]);
      expect(summary.nextAvailableAchievements).toEqual([
        '10 Purchases',
        'Big Spender',
      ]);
    });

    it('returns every group first achievement as next available when nothing is unlocked yet', async () => {
      repository.findAllGroups.mockResolvedValue(GROUPS);
      repository.findAllAchievementsOrdered.mockResolvedValue(ACHIEVEMENTS);
      repository.findUnlockedAchievementIds.mockResolvedValue(new Set());

      const summary = await service.getUserAchievementsSummary('user-1');

      expect(summary.unlockedAchievements).toEqual([]);
      expect(summary.nextAvailableAchievements).toEqual([
        'First Purchase',
        'Big Spender',
      ]);
    });
  });
});
