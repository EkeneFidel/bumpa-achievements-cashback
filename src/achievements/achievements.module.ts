import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AchievementsService } from './services/achievements.service';
import { AchievementsController } from './controllers/achievements.controller';
import { AchievementsRepository } from './achievements.repository';
import { AchievementsListener } from './achievements.listener';
import { AchievementGroup } from './entities/achievement-group.entity';
import { Achievement } from './entities/achievement.entity';
import { UserAchievement } from './entities/user-achievement.entity';
import { Purchase } from '../purchase/entities/purchase.entity';
import { BadgesModule } from '../badges/badges.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AchievementGroup,
      Achievement,
      UserAchievement,
      Purchase,
    ]),
    forwardRef(() => BadgesModule),
  ],
  controllers: [AchievementsController],
  providers: [
    AchievementsService,
    AchievementsRepository,
    AchievementsListener,
  ],
  exports: [AchievementsService],
})
export class AchievementsModule {}
