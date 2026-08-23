import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Purchase } from '../purchase/entities/purchase.entity';
import { AchievementGroup } from './entities/achievement-group.entity';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';

@Injectable()
export class AchievementsRepository {
  constructor(
    @InjectRepository(AchievementGroup)
    private readonly groupRepository: Repository<AchievementGroup>,
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(UserAchievement)
    private readonly userAchievementRepository: Repository<UserAchievement>,
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
  ) {}

  getUserPurchaseCount(userId: string): Promise<number> {
    return this.purchaseRepository.count({ where: { userId } });
  }

  async getUserTotalSpend(userId: string): Promise<bigint> {
    const result = await this.purchaseRepository
      .createQueryBuilder('purchase')
      .select('COALESCE(SUM(purchase.totalAmount), 0)', 'total')
      .where('purchase.userId = :userId', { userId })
      .getRawOne<{ total: string }>();

    return BigInt(result?.total ?? 0);
  }

  findAllGroups(): Promise<AchievementGroup[]> {
    return this.groupRepository.find();
  }

  findAllAchievementsOrdered(): Promise<Achievement[]> {
    return this.achievementRepository.find({
      order: { groupId: 'ASC', sortOrder: 'ASC' },
    });
  }

  async findUnlockedAchievementIds(userId: string): Promise<Set<string>> {
    const rows = await this.userAchievementRepository.find({
      where: { userId },
      select: { achievementId: true },
    });
    return new Set(rows.map((row) => row.achievementId));
  }

  countUnlockedAchievements(userId: string): Promise<number> {
    return this.userAchievementRepository.count({ where: { userId } });
  }

  async insertUnlockedAchievement(
    userId: string,
    achievementId: string,
  ): Promise<boolean> {
    const result = await this.userAchievementRepository
      .createQueryBuilder()
      .insert()
      .into(UserAchievement)
      .values({ userId, achievementId })
      .orIgnore()
      .returning('id')
      .execute();

    const insertedRows = result.raw as unknown[];
    return insertedRows.length > 0;
  }
}
