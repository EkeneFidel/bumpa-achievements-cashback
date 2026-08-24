import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../controllers/auth.controller';
import { AuthService } from '../services/auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock };

  beforeEach(async () => {
    authService = { login: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('logs in using the user LocalStrategy attached to the request', () => {
    const fakeRequest = { user: { id: 'user-1', username: 'ekene1' } };
    const loginResult = { access_token: 'signed.jwt.token' };
    authService.login.mockReturnValue(loginResult);

    const result = controller.login(fakeRequest);

    expect(authService.login).toHaveBeenCalledWith(fakeRequest.user);
    expect(result).toBe(loginResult);
  });
});
