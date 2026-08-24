import { Test, TestingModule } from '@nestjs/testing';
import { AchievementsController } from '../controllers/achievements.controller';
import { AchievementsService } from '../services/achievements.service';
import { BadgesService } from '../../badges/services/badges.service';

describe('AchievementsController', () => {
  let controller: AchievementsController;
  let achievementsService: { getUserAchievementsSummary: jest.Mock };
  let badgesService: { getUserBadgeStatus: jest.Mock };

  beforeEach(async () => {
    achievementsService = { getUserAchievementsSummary: jest.fn() };
    badgesService = { getUserBadgeStatus: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AchievementsController],
      providers: [
        { provide: AchievementsService, useValue: achievementsService },
        { provide: BadgesService, useValue: badgesService },
      ],
    }).compile();

    controller = module.get<AchievementsController>(AchievementsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUserAchievements', () => {
    it('combines the achievements summary and badge status into the response shape', async () => {
      achievementsService.getUserAchievementsSummary.mockResolvedValue({
        unlockedAchievements: ['First Purchase', '5 Purchases'],
        nextAvailableAchievements: ['10 Purchases', 'Big Spender'],
      });
      badgesService.getUserBadgeStatus.mockResolvedValue({
        currentBadge: 'Achiever',
        nextBadge: 'Advanced',
        remainingToUnlockNextBadge: 3,
      });

      const result = await controller.getUserAchievements({
        id: 'user-1',
      });

      expect(achievementsService.getUserAchievementsSummary).toHaveBeenCalledWith(
        'user-1',
      );
      expect(badgesService.getUserBadgeStatus).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({
        unlocked_achievements: ['First Purchase', '5 Purchases'],
        next_available_achievements: ['10 Purchases', 'Big Spender'],
        current_badge: 'Achiever',
        next_badge: 'Advanced',
        remaining_to_unlock_next_badge: 3,
      });
    });

    it('reflects a user with no unlocked achievements or badge yet', async () => {
      achievementsService.getUserAchievementsSummary.mockResolvedValue({
        unlockedAchievements: [],
        nextAvailableAchievements: ['First Purchase', 'Big Spender'],
      });
      badgesService.getUserBadgeStatus.mockResolvedValue({
        currentBadge: null,
        nextBadge: 'Rookie',
        remainingToUnlockNextBadge: 1,
      });

      const result = await controller.getUserAchievements({
        id: 'user-2',
      });

      expect(result).toEqual({
        unlocked_achievements: [],
        next_available_achievements: ['First Purchase', 'Big Spender'],
        current_badge: null,
        next_badge: 'Rookie',
        remaining_to_unlock_next_badge: 1,
      });
    });
  });
});
