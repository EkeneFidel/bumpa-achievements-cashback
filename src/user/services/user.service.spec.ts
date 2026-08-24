import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserService } from '../services/user.service';
import { User } from '../entities/user.entity';

describe('UserService', () => {
  let service: UserService;

  let queryBuilder: {
    addSelect: jest.Mock;
    where: jest.Mock;
    getOne: jest.Mock;
  };

  beforeEach(async () => {
    queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    };

    const userRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: userRepository },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('finds a user by username and asks for the password column explicitly', async () => {
    const user = { id: 'user-1', username: 'ekene1', password: 'hashed' };
    queryBuilder.getOne.mockResolvedValue(user);

    const result = await service.findByUsername('ekene1');

    expect(result).toBe(user);
    // password is select: false on the entity, so it's hidden by default
    // this checks the service really does opt back in for it.
    expect(queryBuilder.addSelect).toHaveBeenCalledWith('user.password');
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'user.username = :username',
      { username: 'ekene1' },
    );
  });

  it('returns null when no user has that username', async () => {
    queryBuilder.getOne.mockResolvedValue(null);

    const result = await service.findByUsername('nobody');

    expect(result).toBeNull();
  });
});
