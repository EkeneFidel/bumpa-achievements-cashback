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
import { Product } from './../../src/product/entities/product.entity';

// Integration tests for GET /products

describe('Products integration test', () => {
  let app: INestApplication<App>;
  let userRepo: Repository<User>;
  let productRepo: Repository<Product>;
  let testUser: User;
  let testProduct: Product;
  let token: string;

  const PASSWORD = 'Testpass123!';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    productRepo = moduleFixture.get(getRepositoryToken(Product));

    testUser = await userRepo.save({
      name: 'Test Shopper',
      username: `test-shopper-${randomUUID()}`,
      password: await bcrypt.hash(PASSWORD, 10),
      bankAccountNumber: '0000000000',
      bankCode: '000',
      balance: 0n,
    });

    testProduct = await productRepo.save({
      name: `Test Product ${randomUUID()}`,
      price: 5000n,
      stock: 10,
    });

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: testUser.username, password: PASSWORD });
    token = loginRes.body.data.access_token;
  });

  afterAll(async () => {
    await productRepo.delete({ id: testProduct.id });
    await userRepo.delete({ id: testUser.id });
    await app.close();
  });

  it('rejects the request when there is no bearer token', () => {
    return request(app.getHttpServer()).get('/products').expect(401);
  });

  it('returns the product list when a valid token is given', async () => {
    const res = await request(app.getHttpServer())
      .get('/products')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body.data)).toBe(true);
    const found = res.body.data.find(
      (product: { id: string }) => product.id === testProduct.id,
    );
    expect(found).toBeDefined();
    expect(found.stock).toBe(10);
  });
});
