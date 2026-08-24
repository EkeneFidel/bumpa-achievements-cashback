import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BadgesService } from './services/badges.service';
import { BadgesRepository } from './badges.repository';
import { BadgesListener } from './badges.listener';
import { Badge } from './entities/badge.entity';
import { UserBadge } from './entities/user-badge.entity';
import { AchievementsModule } from '../achievements/achievements.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Badge, UserBadge]),
    forwardRef(() => AchievementsModule),
    OutboxModule,
  ],
  providers: [BadgesService, BadgesRepository, BadgesListener],
  exports: [BadgesService],
})
export class BadgesModule {}
