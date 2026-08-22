import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';

describe('AuthService', () => {
  let service: AuthService;
  let userService: { findByUsername: jest.Mock };
  let jwtService: { sign: jest.Mock };

  // A real bcrypt hash of a known password, so validateUser's
  // bcrypt.compare() call is genuinely exercised instead of mocked away.
  const CORRECT_PASSWORD = 'correct-password';
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(CORRECT_PASSWORD, 10);
  });

  beforeEach(async () => {
    userService = { findByUsername: jest.fn() };
    jwtService = { sign: jest.fn(() => 'signed.jwt.token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('validateUser', () => {
    it('returns the user without the password when the password is correct', async () => {
      userService.findByUsername.mockResolvedValue({
        id: 'user-1',
        username: 'ekene1',
        password: passwordHash,
      });

      const result = await service.validateUser('ekene1', CORRECT_PASSWORD);

      expect(result).toEqual({ id: 'user-1', username: 'ekene1' });
      // The password should not be sent back.
      expect(result).not.toHaveProperty('password');
    });

    it('rejects a wrong password', async () => {
      userService.findByUsername.mockResolvedValue({
        id: 'user-1',
        username: 'ekene1',
        password: passwordHash,
      });

      await expect(
        service.validateUser('ekene1', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a username that does not exist', async () => {
      userService.findByUsername.mockResolvedValue(null);

      await expect(
        service.validateUser('nobody', CORRECT_PASSWORD),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  //The user successfully logs in with the valid credentials
  describe('login', () => {
    it('logs in a user with valid credentials and returns a JWT token', () => {
      const result = service.login({ id: 'user-1', username: 'ekene1' });

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        username: 'ekene1',
      });
      expect(result.access_token).toBe('signed.jwt.token');
      expect(result.user).toEqual({ id: 'user-1', username: 'ekene1' });
    });
  });
});
