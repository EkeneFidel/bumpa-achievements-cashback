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
import { Purchase } from './../../src/purchase/entities/purchase.entity';

// Integration tests for POST /purchases.

const TEST_PASSWORD = 'Testpass123!';

describe('Purchase integration test', () => {
  let app: INestApplication<App>;
  let userRepo: Repository<User>;
  let productRepo: Repository<Product>;
  let purchaseRepo: Repository<Purchase>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    productRepo = moduleFixture.get(getRepositoryToken(Product));
    purchaseRepo = moduleFixture.get(getRepositoryToken(Purchase));
  });

  afterAll(async () => {
    await app.close();
  });

  // Creates a test user with a known password and a starting balance
  // so every test knows exactly what to expect.
  async function createTestUser(balance: bigint) {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    return userRepo.save({
      name: 'Test Buyer',
      username: `test-buyer-${randomUUID()}`,
      password: passwordHash,
      bankAccountNumber: '0000000000',
      bankCode: '000',
      balance,
    });
  }

  // Creates a test product with a known price and stock.
  async function createTestProduct(price: bigint, stock: number) {
    return productRepo.save({
      name: `Test Product ${randomUUID()}`,
      price,
      stock,
    });
  }

  // Logs in as a test user via the /auth/login endpoint.
  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: TEST_PASSWORD })
      .expect(201);
    return res.body.data.access_token;
  }

  // Cleans up test user, product and purchases.
  async function cleanup(userIds: string[], productIds: string[]) {
    if (userIds.length) {
      await purchaseRepo.delete({ userId: userIds[0] });
    }
    for (const productId of productIds) {
      await purchaseRepo.delete({ productId });
    }
    if (userIds.length) await userRepo.delete(userIds);
    if (productIds.length) await productRepo.delete(productIds);
  }

  // Test case 1
  // A logged-in user buys a product. Checks that the user's balance,
  // the product's stock, and a new row in the purchases table are updated.
  describe('a logged in user buying a product', () => {
    it('debits the balance, reduces stock, and records the purchase', async () => {
      const price = 5000n;
      const startingBalance = 20000n;
      const startingStock = 10;

      const product = await createTestProduct(price, startingStock);
      const user = await createTestUser(startingBalance);

      try {
        const token = await loginAs(user.username);

        const res = await request(app.getHttpServer())
          .post('/purchases')
          .set('Authorization', `Bearer ${token}`)
          .send({ productId: product.id, quantity: 2 })
          .expect(201);

        // 2 items at 5000 each = 10000 total.
        expect(res.body.data.totalAmount).toBe('10000');
        expect(res.body.data.quantity).toBe(2);
        expect(res.body.data.userId).toBe(user.id);
        expect(res.body.data.productId).toBe(product.id);

        // Recheck the rows from the database to see what was actually saved.
        const updatedUser = await userRepo.findOneByOrFail({ id: user.id });
        expect(BigInt(updatedUser.balance)).toBe(startingBalance - 10000n);

        const updatedProduct = await productRepo.findOneByOrFail({
          id: product.id,
        });
        expect(updatedProduct.stock).toBe(startingStock - 2);

        const savedPurchase = await purchaseRepo.findOne({
          where: { userId: user.id, productId: product.id },
        });
        expect(savedPurchase).not.toBeNull();
        expect(savedPurchase?.quantity).toBe(2);
      } finally {
        await cleanup([user.id], [product.id]);
      }
    });

    it('rejects the purchase and nothing changes when there is not enough stock', async () => {
      const product = await createTestProduct(5000n, 1); // only 1 in stock
      const user = await createTestUser(100000n);

      try {
        const token = await loginAs(user.username);

        await request(app.getHttpServer())
          .post('/purchases')
          .set('Authorization', `Bearer ${token}`)
          .send({ productId: product.id, quantity: 2 }) // asking for more than what exists
          .expect(400);

        // Nothing should have moved: same stock, same balance, no purchase record.
        const updatedProduct = await productRepo.findOneByOrFail({
          id: product.id,
        });
        expect(updatedProduct.stock).toBe(1);

        const updatedUser = await userRepo.findOneByOrFail({ id: user.id });
        expect(BigInt(updatedUser.balance)).toBe(100000n);

        const purchaseCount = await purchaseRepo.count({
          where: { userId: user.id },
        });
        expect(purchaseCount).toBe(0);
      } finally {
        await cleanup([user.id], [product.id]);
      }
    });
  });

  // Test case 2
  // Two different users both try to buy the last item at the same
  // moment. Only one of them should get it
  // PurchaseService should make the second request lose the race
  // not both succeed and leave stock at -1.
  describe('two different users buying the last item in stock at the same time', () => {
    it('lets exactly one purchase succeed and leaves stock at zero', async () => {
      const product = await createTestProduct(5000n, 1); // only 1 left
      const buyerA = await createTestUser(100000n);
      const buyerB = await createTestUser(100000n);

      try {
        const [tokenA, tokenB] = await Promise.all([
          loginAs(buyerA.username),
          loginAs(buyerB.username),
        ]);

        // Fire both requests at the same time
        const [resA, resB] = await Promise.all([
          request(app.getHttpServer())
            .post('/purchases')
            .set('Authorization', `Bearer ${tokenA}`)
            .send({ productId: product.id, quantity: 1 }),
          request(app.getHttpServer())
            .post('/purchases')
            .set('Authorization', `Bearer ${tokenB}`)
            .send({ productId: product.id, quantity: 1 }),
        ]);

        const statuses = [resA.status, resB.status].sort();
        // One request should have gone through (201), the other should have
        // been turned away because the stock was already gone (400).
        expect(statuses).toEqual([201, 400]);

        const updatedProduct = await productRepo.findOneByOrFail({
          id: product.id,
        });
        // stock lands on exactly 0, never -1.
        // a negative stock would mean both purchases went through
        expect(updatedProduct.stock).toBe(0);

        const purchaseCount = await purchaseRepo.count({
          where: { productId: product.id },
        });
        expect(purchaseCount).toBe(1);
      } finally {
        await cleanup([buyerA.id, buyerB.id], [product.id]);
      }
    });
  });

  // Test case 3
  // The same user clicks "buy" twice very quickly on the last item.
  // They should only be charged once, and only one purchase should be recorded,
  // the second click should be rejected, not treated as a second, separate sale.
  describe('the same user submitting the same purchase twice in quick succession', () => {
    it('only completes one purchase and only takes payment once', async () => {
      const price = 5000n;
      // enough balance to afford more than one item
      const startingBalance = 100000n;
      // only 1 item in stock
      const product = await createTestProduct(price, 1);
      const user = await createTestUser(startingBalance);

      try {
        const token = await loginAs(user.username);

        const sendPurchase = () =>
          request(app.getHttpServer())
            .post('/purchases')
            .set('Authorization', `Bearer ${token}`)
            .send({ productId: product.id, quantity: 1 });

        // Two identical requests, sent together, like a double click.
        const [first, second] = await Promise.all([
          sendPurchase(),
          sendPurchase(),
        ]);

        const statuses = [first.status, second.status].sort();
        expect(statuses).toEqual([201, 400]);

        // Balance should drop by exactly one price, not two.
        const updatedUser = await userRepo.findOneByOrFail({ id: user.id });
        expect(BigInt(updatedUser.balance)).toBe(startingBalance - price);

        const updatedProduct = await productRepo.findOneByOrFail({
          id: product.id,
        });
        expect(updatedProduct.stock).toBe(0);

        // Only one purchase row should exist for this user and product,
        // even though two requests were sent.
        const purchaseCount = await purchaseRepo.count({
          where: { userId: user.id, productId: product.id },
        });
        expect(purchaseCount).toBe(1);
      } finally {
        await cleanup([user.id], [product.id]);
      }
    });
  });
});
