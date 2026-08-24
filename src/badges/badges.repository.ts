import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Badge } from './entities/badge.entity';
import { UserBadge } from './entities/user-badge.entity';

@Injectable()
export class BadgesRepository {
  constructor(
    @InjectRepository(Badge)
    private readonly badgeRepository: Repository<Badge>,
    @InjectRepository(UserBadge)
    private readonly userBadgeRepository: Repository<UserBadge>,
  ) { }

  findAllOrderedByRequirement(): Promise<Badge[]> {
    return this.badgeRepository.find({
      order: { achievementsRequired: 'ASC' },
    });
  }

  async findUserHighestBadge(userId: string): Promise<Badge | null> {
    const userBadge = await this.userBadgeRepository.findOne({
      where: { userId },
      relations: { badge: true },
      order: { badge: { achievementsRequired: 'DESC' } },
    });
    return userBadge?.badge ?? null;
  }

  async insertUserBadge(
    userId: string,
    badgeId: string,
    manager?: EntityManager,
  ): Promise<string | null> {
    const repository = manager
      ? manager.getRepository(UserBadge)
      : this.userBadgeRepository;

    const result = await repository
      .createQueryBuilder()
      .insert()
      .into(UserBadge)
      .values({ userId, badgeId })
      .orIgnore()
      .returning('id')
      .execute();

    const insertedRows = result.raw as { id: string }[];
    return insertedRows.length > 0 ? insertedRows[0].id : null;
  }
}
