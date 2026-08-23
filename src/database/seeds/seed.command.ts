import { Command, CommandRunner } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../user/entities/user.entity';
import { Product } from '../../product/entities/product.entity';
import { AchievementGroup } from '../../achievements/entities/achievement-group.entity';
import { Achievement } from '../../achievements/entities/achievement.entity';
import { Badge } from '../../badges/entities/badge.entity';

@Injectable()
@Command({
  name: 'seed:db',
  description: 'Seed the database',
})
export class SeedCommand extends CommandRunner {
  private readonly logger = new Logger(SeedCommand.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(AchievementGroup)
    private readonly achievementGroupRepository: Repository<AchievementGroup>,
    @InjectRepository(Achievement)
    private readonly achievementRepository: Repository<Achievement>,
    @InjectRepository(Badge)
    private readonly badgeRepository: Repository<Badge>,
  ) {
    super();
  }

  // seeds each dataset only if its table is empty
  async run(): Promise<void> {
    this.logger.log('Seeding database...');

    if ((await this.userRepository.count()) === 0) {
      await this.userRepository.save([
        {
          name: 'Ekene Chukwurah',
          username: 'ekene1',
          password: await bcrypt.hash('Testpassword2', 10),
          bankAccountNumber: '0901604042',
          bankCode: '058',
          balance: 100_000_00n,
        },
        {
          name: 'Saka Saliba',
          username: 'saka1',
          password: await bcrypt.hash('Testpassword1', 10),
          bankAccountNumber: '0987654321',
          bankCode: '011',
          balance: 50_000_00n,
        },
      ]);
      this.logger.log('Seeded users');
    }

    if ((await this.productRepository.count()) === 0) {
      await this.productRepository.save([
        { name: 'Wireless Earbuds', price: 10_000_00n, stock: 50 },
        { name: 'Smart Watch', price: 15_000_00n, stock: 30 },
        { name: 'Bluetooth Speaker', price: 10_000_00n, stock: 4 },
      ]);
      this.logger.log('Seeded products');
    }

    if ((await this.achievementGroupRepository.count()) === 0) {
      const [purchaseCountGroup, totalSpendGroup] =
        await this.achievementGroupRepository.save([
          { key: 'purchase_count' },
          { key: 'total_spend' },
        ]);

      await this.achievementRepository.save([
        {
          groupId: purchaseCountGroup.id,
          name: 'First Purchase',
          threshold: 1n,
          sortOrder: 1,
        },
        {
          groupId: purchaseCountGroup.id,
          name: '5 Purchases',
          threshold: 5n,
          sortOrder: 2,
        },
        {
          groupId: purchaseCountGroup.id,
          name: '10 Purchases',
          threshold: 10n,
          sortOrder: 3,
        },
        {
          groupId: totalSpendGroup.id,
          name: 'Big Spender',
          threshold: 20_000_00n,
          sortOrder: 1,
        },
        {
          groupId: totalSpendGroup.id,
          name: 'Power Buyer',
          threshold: 50_000_00n,
          sortOrder: 2,
        },
      ]);
      this.logger.log('Seeded achievement groups and achievements');
    }

    if ((await this.badgeRepository.count()) === 0) {
      await this.badgeRepository.save([
        { name: 'Rookie', achievementsRequired: 1 },
        { name: 'Rising Star', achievementsRequired: 3 },
        { name: 'Achiever', achievementsRequired: 5 },
        { name: 'Advanced', achievementsRequired: 8 },
      ]);
      this.logger.log('Seeded badges');
    }

    this.logger.log('Seeding complete');
  }
}
