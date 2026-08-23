import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../database.module';
import { User } from '../../user/entities/user.entity';
import { Product } from '../../product/entities/product.entity';
import { AchievementGroup } from '../../achievements/entities/achievement-group.entity';
import { Achievement } from '../../achievements/entities/achievement.entity';
import { Badge } from '../../badges/entities/badge.entity';
import { SeedCommand } from './seed.command';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    TypeOrmModule.forFeature([
      User,
      Product,
      AchievementGroup,
      Achievement,
      Badge,
    ]),
  ],
  providers: [SeedCommand],
})
export class SeedModule {}
