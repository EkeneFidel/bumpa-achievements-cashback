import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { App } from 'supertest/types';
import { In, Repository } from 'typeorm';
import { AppModule } from './../../src/app.module';
import { User } from './../../src/user/entities/user.entity';
import { Product } from './../../src/product/entities/product.entity';
import { Purchase } from './../../src/purchase/entities/purchase.entity';
import { AchievementGroup } from './../../src/achievements/entities/achievement-group.entity';
import { Achievement } from './../../src/achievements/entities/achievement.entity';
import { Badge } from './../../src/badges/entities/badge.entity';
import { UserBadge } from './../../src/badges/entities/user-badge.entity';
import { Transfer } from './../../src/payment/entities/transfer.entity';
import { TransferStatus } from './../../src/payment/enums/transfer-status.enum';
import { OutboxEvent } from './../../src/outbox/entities/outbox-event.entity';
import { OutboxStatus } from './../../src/outbox/enums/outbox-status.enum';
import {
  BADGE_CASHBACK_AMOUNT,
  BADGE_CASHBACK_OUTBOX_EVENT_TYPE,
} from './../../src/payment/cashback.constants';
import { TRANSFER_PROVIDER } from './../../src/payment/providers/transfer-provider.interface';
import type {
  InitiateTransferInput,
  InitiateTransferResult,
  TransferProvider,
  TransferProviderStatus,
  TransferStatusEvent,
} from './../../src/payment/providers/transfer-provider.interface';
import { TransferVerificationService } from './../../src/payment/queues/transfer-verification.service';

const TEST_PASSWORD = 'Testpass123!';
const PURCHASE_COUNT_GROUP_KEY = 'purchase_count';

// A fake transfer provider that mimics korapay behaviour
class FakeTransferProvider implements TransferProvider {
  readonly providerName = 'fake';
  readonly initiateCalls: InitiateTransferInput[] = [];
  readonly verifyCalls: string[] = [];

  nextInitiateStatus: TransferProviderStatus = 'success';
  nextVerifyStatus: TransferProviderStatus = 'success';

  async initiateTransfer(
    input: InitiateTransferInput,
  ): Promise<InitiateTransferResult> {
    this.initiateCalls.push(input);
    return { transferCode: input.reference, status: this.nextInitiateStatus };
  }

  async verifyTransaction(reference: string): Promise<TransferStatusEvent> {
    this.verifyCalls.push(reference);
    return { reference, status: this.nextVerifyStatus, transferCode: reference };
  }
}


async function waitTimer<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  { timeoutMs = 8000, intervalMs = 150 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await fn();
    if (predicate(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);
  throw new Error('Timed out waiting for condition');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Cashback payment flow integration test', () => {
  let app: INestApplication<App>;
  let userRepo: Repository<User>;
  let productRepo: Repository<Product>;
  let purchaseRepo: Repository<Purchase>;
  let groupRepo: Repository<AchievementGroup>;
  let achievementRepo: Repository<Achievement>;
  let badgeRepo: Repository<Badge>;
  let userBadgeRepo: Repository<UserBadge>;
  let transferRepo: Repository<Transfer>;
  let outboxRepo: Repository<OutboxEvent>;
  let transferVerificationService: TransferVerificationService;
  let fakeProvider: FakeTransferProvider;

  let createdGroupId: string | null = null;
  let createdAchievementIds: string[] = [];
  let createdBadgeIds: string[] = [];

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdTransferIds: string[] = [];
  const createdOutboxEventIds: string[] = [];

  beforeAll(async () => {
    fakeProvider = new FakeTransferProvider();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TRANSFER_PROVIDER)
      .useValue(fakeProvider)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    productRepo = moduleFixture.get(getRepositoryToken(Product));
    purchaseRepo = moduleFixture.get(getRepositoryToken(Purchase));
    groupRepo = moduleFixture.get(getRepositoryToken(AchievementGroup));
    achievementRepo = moduleFixture.get(getRepositoryToken(Achievement));
    badgeRepo = moduleFixture.get(getRepositoryToken(Badge));
    userBadgeRepo = moduleFixture.get(getRepositoryToken(UserBadge));
    transferRepo = moduleFixture.get(getRepositoryToken(Transfer));
    outboxRepo = moduleFixture.get(getRepositoryToken(OutboxEvent));
    transferVerificationService = moduleFixture.get(TransferVerificationService);

    await addPurchaseCountAchievements();
    await addBadges();
  });

  afterAll(async () => {
    // Wait for any background badge or cashback processing to finish
    // before we start deleting the rows it depends on
    await sleep(500);

    if (createdTransferIds.length) {
      await transferRepo.delete(createdTransferIds);
    }
    if (createdOutboxEventIds.length) {
      await outboxRepo.delete(createdOutboxEventIds);
    }
    if (createdUserIds.length) {
      await purchaseRepo.delete({ userId: In(createdUserIds) });
      await userBadgeRepo.delete({ userId: In(createdUserIds) });
      await userRepo.delete(createdUserIds);
    }
    if (createdProductIds.length) {
      await productRepo.delete(createdProductIds);
    }
    if (createdAchievementIds.length) {
      await achievementRepo.delete(createdAchievementIds);
    }
    if (createdGroupId) {
      await groupRepo.delete({ id: createdGroupId });
    }
    if (createdBadgeIds.length) {
      await badgeRepo.delete(createdBadgeIds);
    }
    await app.close();
  });

  // Make sure the purchase_count group has at least a 1-purchase achievement to unlock
  async function addPurchaseCountAchievements() {
    let group = await groupRepo.findOne({
      where: { key: PURCHASE_COUNT_GROUP_KEY },
    });
    if (!group) {
      group = await groupRepo.save({ key: PURCHASE_COUNT_GROUP_KEY });
      createdGroupId = group.id;
    }

    const existing = await achievementRepo.find({ where: { groupId: group.id } });
    if (existing.length === 0) {
      const inserted = await achievementRepo.save([
        {
          groupId: group.id,
          name: `Cashback IT First Purchase ${randomUUID()}`,
          threshold: 1n,
          sortOrder: 1,
        },
      ]);
      createdAchievementIds = inserted.map((a) => a.id);
    }
  }

  // Make sure at there is at least one badge the user can earn
  async function addBadges() {
    const existing = await badgeRepo.find();
    if (existing.length === 0) {
      const inserted = await badgeRepo.save([
        { name: `Cashback IT Rookie ${randomUUID()}`, achievementsRequired: 1 },
      ]);
      createdBadgeIds = inserted.map((b) => b.id);
    }
  }

  async function createTestUser(balance: bigint) {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    return userRepo.save({
      name: 'Test Cashback User',
      username: `test-cashback-${randomUUID()}`,
      email: `test-cashback-${randomUUID()}@mailinator.com`,
      password: passwordHash,
      bankAccountNumber: '0000000000',
      bankCode: '033',
      balance,
    });
  }

  // Price is set at 1 so this never triggers any spend threshold for test purposes
  async function createCheapTestProduct(stock: number) {
    return productRepo.save({
      name: `Cashback IT Product ${randomUUID()}`,
      price: 1n,
      stock,
    });
  }

  async function loginAs(username: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: TEST_PASSWORD })
      .expect(201);
    return res.body.data.access_token;
  }

  async function purchaseOnce(token: string, productId: string) {
    return request(app.getHttpServer())
      .post('/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, quantity: 1 })
      .expect(201);
  }

  async function findOutboxEventForUser(userId: string) {
    const events = await outboxRepo.find({
      where: { eventType: BADGE_CASHBACK_OUTBOX_EVENT_TYPE },
    });
    return (
      events.find((event) => (event.payload as { userId?: string }).userId === userId) ??
      null
    );
  }

  // Test case 1
  // Unlocking a badge from a purchase should end with the user actually
  // being paid, through the whole outbox, queue worker pipeline.
  it('pays the user a cashback once a badge is unlocked from a purchase', async () => {
    fakeProvider.nextInitiateStatus = 'success';

    const product = await createCheapTestProduct(20);
    const user = await createTestUser(100_000n);
    createdUserIds.push(user.id);
    createdProductIds.push(product.id);

    const token = await loginAs(user.username);
    await purchaseOnce(token, product.id);

    // Wait for the badge to actually be awarded first.
    await waitTimer(
      () => userBadgeRepo.count({ where: { userId: user.id } }),
      (count) => count > 0,
    );

    const transfer = await waitTimer(
      () => transferRepo.findOne({ where: { userId: user.id } }),
      (found) => found !== null && found.status !== TransferStatus.PENDING,
    );
    createdTransferIds.push(transfer!.id);

    expect(BigInt(transfer!.amount)).toBe(BADGE_CASHBACK_AMOUNT);
    expect(transfer!.status).toBe(TransferStatus.SUCCESS);

    // The provider was called exactly once, with this user's own bank details
    const callsForThisTransfer = fakeProvider.initiateCalls.filter(
      (call) => call.reference === transfer!.reference,
    );
    expect(callsForThisTransfer.length).toBe(1);
    expect(callsForThisTransfer[0]).toEqual(
      expect.objectContaining({
        amount: BADGE_CASHBACK_AMOUNT,
        bankCode: '033',
        accountNumber: '0000000000',
        accountName: user.name,
        customerEmail: user.email,
      }),
    );

    // Wait to check that the outbox event sending this cashback ends up dispatched, not stuck in pending
    const outboxEvent = await waitTimer(
      () => findOutboxEventForUser(user.id),
      (found) => found !== null,
    );
    createdOutboxEventIds.push(outboxEvent!.id);
    expect(outboxEvent!.status).toBe(OutboxStatus.DISPATCHED);
  });

  // Test case 2
  // Check that a processing transfer is resolved once verification is called
  it('resolves a processing transfer once verification is called', async () => {
    fakeProvider.nextInitiateStatus = 'pending';

    const product = await createCheapTestProduct(20);
    const user = await createTestUser(100_000n);
    createdUserIds.push(user.id);
    createdProductIds.push(product.id);

    const token = await loginAs(user.username);
    await purchaseOnce(token, product.id);

    const transfer = await waitTimer(
      () => transferRepo.findOne({ where: { userId: user.id } }),
      (found) => found !== null && found.transferCode !== null,
    );
    createdTransferIds.push(transfer!.id);
    expect(transfer!.status).toBe(TransferStatus.PENDING);

    fakeProvider.nextVerifyStatus = 'success';
    await transferVerificationService.verifyPending();

    const settled = await transferRepo.findOneByOrFail({ id: transfer!.id });
    expect(settled.status).toBe(TransferStatus.SUCCESS);
    expect(fakeProvider.verifyCalls).toContain(transfer!.reference);
  });
});
