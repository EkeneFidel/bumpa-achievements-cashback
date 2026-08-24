import {
  Controller,
  Get,
  Param,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AchievementsService } from '../services/achievements.service';
import { BadgesService } from '../../badges/services/badges.service';
import { GetUserAchievementsParamsDto } from '../dto/get-user-achievements-params.dto';

interface UserAchievementsResponse {
  unlocked_achievements: string[];
  next_available_achievements: string[];
  current_badge: string | null;
  next_badge: string | null;
  remaining_to_unlock_next_badge: number;
}

@Controller('users/:id/achievements')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AchievementsController {
  constructor(
    private readonly achievementsService: AchievementsService,
    private readonly badgesService: BadgesService,
  ) {}

  @Get()
  async getUserAchievements(
    @Param() { id: userId }: GetUserAchievementsParamsDto,
  ): Promise<UserAchievementsResponse> {
    const [achievementsSummary, badgeStatus] = await Promise.all([
      this.achievementsService.getUserAchievementsSummary(userId),
      this.badgesService.getUserBadgeStatus(userId),
    ]);

    return {
      unlocked_achievements: achievementsSummary.unlockedAchievements,
      next_available_achievements:
        achievementsSummary.nextAvailableAchievements,
      current_badge: badgeStatus.currentBadge,
      next_badge: badgeStatus.nextBadge,
      remaining_to_unlock_next_badge: badgeStatus.remainingToUnlockNextBadge,
    };
  }
}
