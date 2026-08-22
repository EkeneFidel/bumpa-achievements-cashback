import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { AppModule } from './../../src/app.module';
import { User } from './../../src/user/entities/user.entity';

// Integration tests for POST /auth/login
describe('Authentication flow integration test', () => {
  let app: INestApplication<App>;
  let userRepo: Repository<User>;
  let testUser: User;

  const PASSWORD = 'Testpass123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));

    testUser = await userRepo.save({
      name: 'Test Login User',
      username: `test-login-${randomUUID()}`,
      password: await bcrypt.hash(PASSWORD, 10),
      bankAccountNumber: '0000000000',
      bankCode: '000',
      balance: 0n,
    });
  });

  afterAll(async () => {
    await userRepo.delete({ id: testUser.id });
    await app.close();
  });

  it('logs in with the correct username and password and returns access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: testUser.username, password: PASSWORD })
      .expect(201);

    expect(typeof res.body.data.access_token).toBe('string');
    expect(res.body.data.access_token.length).toBeGreaterThan(0);
    expect(res.body.data.user.username).toBe(testUser.username);
    // The password hash must not be returned in the response.
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('it fails to login when given the wrong password', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: testUser.username, password: 'wrong-password' })
      .expect(401);
  });

  it('it fails to login when given a username that does not exist', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'no-such-user', password: PASSWORD })
      .expect(401);
  });
});
