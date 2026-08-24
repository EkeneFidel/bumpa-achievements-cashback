import { Controller } from '@nestjs/common';
import { BadgesService } from '../services/badges.service';

@Controller('badges')
export class BadgesController {
  constructor(private readonly badgesService: BadgesService) {}
}
