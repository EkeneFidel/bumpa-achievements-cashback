import { Test, TestingModule } from '@nestjs/testing';
import { BadgesController } from '../controllers/badges.controller';
import { BadgesService } from '../services/badges.service';

describe('BadgesController', () => {
  let controller: BadgesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BadgesController],
      providers: [BadgesService],
    }).compile();

    controller = module.get<BadgesController>(BadgesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
