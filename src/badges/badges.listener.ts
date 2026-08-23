import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ACHIEVEMENT_UNLOCKED_EVENT,
  AchievementUnlockedEvent,
} from '../achievements/events/achievement-unlocked.event';
import { BadgesService } from './badges.service';

@Injectable()
export class BadgesListener {
  constructor(private readonly badgesService: BadgesService) {}

  @OnEvent(ACHIEVEMENT_UNLOCKED_EVENT)
  async handleAchievementUnlocked(
    event: AchievementUnlockedEvent,
  ): Promise<void> {
    await this.badgesService.evaluateForUser(event.user.id);
  }
}
