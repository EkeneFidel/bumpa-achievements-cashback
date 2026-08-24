import { Test, TestingModule } from '@nestjs/testing';
import { BadgesController } from '../controllers/badges.controller';
import { BadgesService } from '../services/badges.service';

describe('BadgesController', () => {
  let controller: BadgesController;
  let badgesService: { getUserBadgeStatus: jest.Mock };

  beforeEach(async () => {
    badgesService = { getUserBadgeStatus: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BadgesController],
      providers: [{ provide: BadgesService, useValue: badgesService }],
    }).compile();

    controller = module.get<BadgesController>(BadgesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
