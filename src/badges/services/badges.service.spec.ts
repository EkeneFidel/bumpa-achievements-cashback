import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BadgesService } from '../services/badges.service';
import { BadgesRepository } from '../badges.repository';
import { AchievementsService } from '../../achievements/services/achievements.service';
import { OutboxService } from '../../outbox/outbox.service';
import { BADGE_CASHBACK_OUTBOX_EVENT_TYPE } from '../../payment/cashback.constants';
import { BADGE_UNLOCKED_EVENT } from '../events/badge-unlocked.event';

// Mock badges, like the badge data.
const BADGES = [
  { id: 'badge-rookie', name: 'Rookie', achievementsRequired: 1 },
  { id: 'badge-rising-star', name: 'Rising Star', achievementsRequired: 3 },
  { id: 'badge-achiever', name: 'Achiever', achievementsRequired: 5 },
  { id: 'badge-advanced', name: 'Advanced', achievementsRequired: 8 },
];

describe('BadgesService', () => {
  let service: BadgesService;
  let repository: {
    findAllOrderedByRequirement: jest.Mock;
    findUserHighestBadge: jest.Mock;
    insertUserBadge: jest.Mock;
  };
  let achievementsService: { countUnlockedAchievements: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let outboxService: { record: jest.Mock };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: object;
  };

  beforeEach(async () => {
    repository = {
      findAllOrderedByRequirement: jest.fn().mockResolvedValue(BADGES),
      findUserHighestBadge: jest.fn(),
      insertUserBadge: jest.fn(),
    };
    achievementsService = { countUnlockedAchievements: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    outboxService = { record: jest.fn() };

    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {},
    };
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BadgesService,
        { provide: BadgesRepository, useValue: repository },
        { provide: AchievementsService, useValue: achievementsService },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    service = module.get<BadgesService>(BadgesService);
  });


  describe('test evaluateForUser', () => {
    it('unlocks the highest badge the user is eligible for, records the cashback owed, and emits an event', async () => {
      achievementsService.countUnlockedAchievements.mockResolvedValue(5);
      repository.insertUserBadge.mockResolvedValue('user-badge-1');

      await service.evaluateForUser('user-1');

      expect(repository.insertUserBadge).toHaveBeenCalledWith(
        'user-1',
        'badge-achiever',
        queryRunner.manager,
      );
      expect(outboxService.record).toHaveBeenCalledWith(
        queryRunner.manager,
        BADGE_CASHBACK_OUTBOX_EVENT_TYPE,
        expect.objectContaining({
          userId: 'user-1',
          badgeId: 'badge-achiever',
          badgeName: 'Achiever',
        }),
      );
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        BADGE_UNLOCKED_EVENT,
        expect.objectContaining({
          badgeName: 'Achiever',
          user: { id: 'user-1' },
          userBadgeId: 'user-badge-1',
        }),
      );
    });

    it('does nothing when the user does not qualify for any badge yet', async () => {
      achievementsService.countUnlockedAchievements.mockResolvedValue(0);

      await service.evaluateForUser('user-1');

      expect(repository.insertUserBadge).not.toHaveBeenCalled();
      expect(outboxService.record).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not record a cashback or emit an event when the user already has the badge', async () => {
      achievementsService.countUnlockedAchievements.mockResolvedValue(5);
      repository.insertUserBadge.mockResolvedValue(null);

      await service.evaluateForUser('user-1');

      expect(repository.insertUserBadge).toHaveBeenCalledWith(
        'user-1',
        'badge-achiever',
        queryRunner.manager,
      );
      expect(outboxService.record).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('getUserBadgeStatus', () => {
    // Example a user who has already earned the Achiever
    // badge (5 achievements required) and has unlocked 5 achievements
    // needs 3 more achievements to reach the Advanced badge.
    it('reports the current badge, the next badge, and how many achievements remain', async () => {
      repository.findAllOrderedByRequirement.mockResolvedValue(BADGES);
      repository.findUserHighestBadge.mockResolvedValue(BADGES[2]);
      achievementsService.countUnlockedAchievements.mockResolvedValue(5);

      const status = await service.getUserBadgeStatus('user-1');

      expect(status.currentBadge).toBe('Achiever');
      expect(status.nextBadge).toBe('Advanced');
      expect(status.remainingToUnlockNextBadge).toBe(3);
    });

    it('has no current badge and needs the smallest badge when the user has never earned a badge', async () => {
      repository.findAllOrderedByRequirement.mockResolvedValue(BADGES);
      repository.findUserHighestBadge.mockResolvedValue(null);
      achievementsService.countUnlockedAchievements.mockResolvedValue(0);

      const status = await service.getUserBadgeStatus('user-1');

      expect(status.currentBadge).toBeNull();
      expect(status.nextBadge).toBe('Rookie');
      expect(status.remainingToUnlockNextBadge).toBe(1);
    });

    it('has no next badge once the user has already earned the highest badge', async () => {
      repository.findAllOrderedByRequirement.mockResolvedValue(BADGES);
      repository.findUserHighestBadge.mockResolvedValue(BADGES[3]);
      achievementsService.countUnlockedAchievements.mockResolvedValue(8);

      const status = await service.getUserBadgeStatus('user-1');

      expect(status.currentBadge).toBe('Advanced');
      expect(status.nextBadge).toBeNull();
      expect(status.remainingToUnlockNextBadge).toBe(0);
    });
  });
});
