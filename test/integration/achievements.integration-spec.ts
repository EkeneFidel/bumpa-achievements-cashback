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
import { UserAchievement } from './../../src/achievements/entities/user-achievement.entity';
import { Badge } from './../../src/badges/entities/badge.entity';
import { UserBadge } from './../../src/badges/entities/user-badge.entity';

const TEST_PASSWORD = 'Testpass123!';
const PURCHASE_COUNT_GROUP_KEY = 'purchase_count';

describe('Achievements and Badges integration test', () => {
  let app: INestApplication<App>;
  let userRepo: Repository<User>;
  let productRepo: Repository<Product>;
  let purchaseRepo: Repository<Purchase>;
  let groupRepo: Repository<AchievementGroup>;
  let achievementRepo: Repository<Achievement>;
  let userAchievementRepo: Repository<UserAchievement>;
  let badgeRepo: Repository<Badge>;
  let userBadgeRepo: Repository<UserBadge>;

  let createdGroupId: string | null = null;
  let createdAchievementIds: string[] = [];
  let createdBadgeIds: string[] = [];

  const createdUserIds: string[] = [];
  const createdProductIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepo = moduleFixture.get(getRepositoryToken(User));
    productRepo = moduleFixture.get(getRepositoryToken(Product));
    purchaseRepo = moduleFixture.get(getRepositoryToken(Purchase));
    groupRepo = moduleFixture.get(getRepositoryToken(AchievementGroup));
    achievementRepo = moduleFixture.get(getRepositoryToken(Achievement));
    userAchievementRepo = moduleFixture.get(getRepositoryToken(UserAchievement));
    badgeRepo = moduleFixture.get(getRepositoryToken(Badge));
    userBadgeRepo = moduleFixture.get(getRepositoryToken(UserBadge));

    await addPurchaseCountAchievements();
    await addBadges();
  });

  afterAll(async () => {
    // For every created user, in case any purchase from the last test is
    // still being checked in the background, we wait for it to finish
    // before deleting the user.
    for (const userId of createdUserIds) {
      await waitUntilBadgeUnlocked(userId, { timeoutMs: 2000 });
    }
    await sleep(500);

    if (createdUserIds.length) {
      await purchaseRepo.delete({ userId: In(createdUserIds) });
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

  // Make sure the purchase_count group has achievements at 1, 5 and 10 purchases to unlock.
  async function addPurchaseCountAchievements() {
    let group = await groupRepo.findOne({
      where: { key: PURCHASE_COUNT_GROUP_KEY },
    });
    if (!group) {
      group = await groupRepo.save({ key: PURCHASE_COUNT_GROUP_KEY });
      createdGroupId = group.id;
    }

    const existing = await achievementRepo.find({
      where: { groupId: group.id },
    });
    if (existing.length === 0) {
      const inserted = await achievementRepo.save([
        {
          groupId: group.id,
          name: `IT First Purchase ${randomUUID()}`,
          threshold: 1n,
          sortOrder: 1,
        },
        {
          groupId: group.id,
          name: `IT 5 Purchases ${randomUUID()}`,
          threshold: 5n,
          sortOrder: 2,
        },
        {
          groupId: group.id,
          name: `IT 10 Purchases ${randomUUID()}`,
          threshold: 10n,
          sortOrder: 3,
        },
      ]);
      createdAchievementIds = inserted.map((a) => a.id);
    }
  }

  // Add the badges for test purposes
  async function addBadges() {
    const existing = await badgeRepo.find();
    if (existing.length === 0) {
      const inserted = await badgeRepo.save([
        { name: `IT Rookie ${randomUUID()}`, achievementsRequired: 1 },
        { name: `IT Rising Star ${randomUUID()}`, achievementsRequired: 3 },
      ]);
      createdBadgeIds = inserted.map((b) => b.id);
    }
  }

  async function createTestUser(balance: bigint) {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    return userRepo.save({
      name: 'Test Achiever',
      username: `test-achiever-${randomUUID()}`,
      email: `test-achiever-${randomUUID()}@mailinator.com`,
      password: passwordHash,
      bankAccountNumber: '0000000000',
      bankCode: '033',
      balance,
    });
  }

  // Price is set at 1 so lots of purchases never add up to a total_spend achievement
  async function createCheapTestProduct(stock: number) {
    return productRepo.save({
      name: `IT Product ${randomUUID()}`,
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

  async function getAchievements(token: string, userId: string) {
    const res = await request(app.getHttpServer())
      .get(`/users/${userId}/achievements`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.data;
  }

  function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // A purchase unlocks achievements in the background
  // This is a helper function to wait for the next achievement to be unlocked
  async function waitUntilAchievementIncreases(
    token: string,
    userId: string,
    expectedCount: number,
    timeoutMs = 5000,
  ) {
    const deadline = Date.now() + timeoutMs;
    let last: Awaited<ReturnType<typeof getAchievements>> | undefined;
    while (Date.now() < deadline) {
      last = await getAchievements(token, userId);
      if (last.unlocked_achievements.length >= expectedCount) {
        return last;
      }
      await sleep(100);
    }
    throw new Error(
      `Timed out waiting for ${expectedCount} unlocked achievement(s); last saw ${last?.unlocked_achievements.length ?? 'nothing'
      }`,
    );
  }

  // Getting a badge happens one step after the achievement is unlocked
  // This is a helper function to wait for the badge to be unlocked
  async function waitUntilBadgeUnlocked(
    userId: string,
    { timeoutMs = 5000, stableForMs = 300, intervalMs = 100 } = {},
  ) {
    const deadline = Date.now() + timeoutMs;
    let lastSerialized = '';
    let stableSince = 0;
    let last = await computeExpectedResponse(userId);
    while (Date.now() < deadline) {
      last = await computeExpectedResponse(userId);
      const serialized = JSON.stringify(last);
      if (serialized === lastSerialized) {
        if (stableSince === 0) stableSince = Date.now();
        if (Date.now() - stableSince >= stableForMs) return last;
      } else {
        lastSerialized = serialized;
        stableSince = 0;
      }
      await sleep(intervalMs);
    }
    return last;
  }

  // Computes what the getUserAchievements endpoint response should look
  // like. This ensures checks stay correct no matter what else is
  // already in the achievements or badges tables.
  async function computeExpectedResponse(userId: string) {
    const [achievements, unlockedRows, badges, earnedBadgeRows] =
      await Promise.all([
        achievementRepo.find({ order: { groupId: 'ASC', sortOrder: 'ASC' } }),
        userAchievementRepo.find({ where: { userId } }),
        badgeRepo.find({ order: { achievementsRequired: 'ASC' } }),

        userBadgeRepo.find({
          where: { userId },
          relations: { badge: true },
          order: { badge: { achievementsRequired: 'DESC' } },
        }),
      ]);

    const unlockedIds = new Set(unlockedRows.map((row) => row.achievementId));
    const unlockedAchievements = achievements
      .filter((a) => unlockedIds.has(a.id))
      .map((a) => a.name);

    const byGroup = new Map<string, Achievement[]>();
    for (const achievement of achievements) {
      const list = byGroup.get(achievement.groupId) ?? [];
      list.push(achievement);
      byGroup.set(achievement.groupId, list);
    }
    const nextAvailableAchievements: string[] = [];
    for (const list of byGroup.values()) {
      const next = list.find((a) => !unlockedIds.has(a.id));
      if (next) nextAvailableAchievements.push(next.name);
    }

    const achievementCount = unlockedIds.size;
    const current = earnedBadgeRows[0]?.badge ?? null;
    const currentRequirement = current?.achievementsRequired ?? -1;
    const next =
      badges.find((b) => b.achievementsRequired > currentRequirement) ?? null;

    return {
      unlocked_achievements: unlockedAchievements,
      next_available_achievements: nextAvailableAchievements,
      current_badge: current?.name ?? null,
      next_badge: next?.name ?? null,
      remaining_to_unlock_next_badge: next
        ? Math.max(next.achievementsRequired - achievementCount, 0)
        : 0,
    };
  }

  function expectSameAchievementsResponse(actual: any, expected: any) {
    expect([...actual.unlocked_achievements].sort()).toEqual(
      [...expected.unlocked_achievements].sort(),
    );
    expect([...actual.next_available_achievements].sort()).toEqual(
      [...expected.next_available_achievements].sort(),
    );
    expect(actual.current_badge).toBe(expected.current_badge);
    expect(actual.next_badge).toBe(expected.next_badge);
    expect(actual.remaining_to_unlock_next_badge).toBe(
      expected.remaining_to_unlock_next_badge,
    );
  }

  // Remembers created user and product for cleanup after all tests are done
  function rememberForCleanup(userId: string, productId: string) {
    createdUserIds.push(userId);
    createdProductIds.push(productId);
  }

  // Test case 1
  // A brand new user starts out with nothing unlocked, and the very
  // first achievement and badge should show up as next.
  it('shows nothing unlocked and the first tiers as next for a brand new user', async () => {
    const product = await createCheapTestProduct(20);
    const user = await createTestUser(100_000n);

    try {
      const token = await loginAs(user.username);

      const actual = await getAchievements(token, user.id);
      const expected = await computeExpectedResponse(user.id);

      expect(actual.unlocked_achievements).toEqual([]);
      expectSameAchievementsResponse(actual, expected);
    } finally {
      rememberForCleanup(user.id, product.id);
    }
  });

  // Test case 2
  // Testing the real purchase flow to ensure that buying enough times
  // unlocks achievements and awards the badge as expected.
  it('unlocks achievements after purchases and awards the badge once enough achievements are unlocked', async () => {
    const product = await createCheapTestProduct(20);
    const user = await createTestUser(100_000n);

    try {
      const token = await loginAs(user.username);

      // Before any purchase, nothing is unlocked.
      let expected = await computeExpectedResponse(user.id);
      expect(expected.unlocked_achievements).toEqual([]);

      // First purchase should pass the 1 purchase threshold.
      await purchaseOnce(token, product.id);
      await waitUntilAchievementIncreases(token, user.id, 1);
      expected = await waitUntilBadgeUnlocked(user.id);
      let actual = await getAchievements(token, user.id);
      expectSameAchievementsResponse(actual, expected);
      expect(actual.unlocked_achievements.length).toBe(1);

      // Keep buying up to 5 purchases to pass the 5 purchases threshold.
      // A short pause between purchases gives the background achievement
      // wait for time to finish for each one before the next purchase.
      for (let i = 0; i < 4; i++) {
        await purchaseOnce(token, product.id);
        await sleep(50);
      }
      actual = await waitUntilAchievementIncreases(token, user.id, 2);

      // Wait for the badge to be saved before checking the final state.
      expected = await waitUntilBadgeUnlocked(user.id);
      actual = await getAchievements(token, user.id);
      expectSameAchievementsResponse(actual, expected);
      expect(actual.unlocked_achievements.length).toBe(2);

      // If the expected state says a badge should be earned by now,
      // check it actually got saved to the database.
      if (expected.current_badge !== null) {
        const userBadgeCount = await userBadgeRepo.count({
          where: { userId: user.id },
        });
        expect(userBadgeCount).toBeGreaterThan(0);
      }
    } finally {
      rememberForCleanup(user.id, product.id);
    }
  });

  // Test case 3
  // Checking that the same achievement or badge is never saved more than once
  // for the same user 
  it('never unlocks the same achievement or the same badge twice for a user', async () => {
    const product = await createCheapTestProduct(20);
    const user = await createTestUser(100_000n);

    try {
      const token = await loginAs(user.username);

      // Pass the first threshold, and wait for the badge to be saved
      // before recording the starting point.
      await purchaseOnce(token, product.id);
      await waitUntilAchievementIncreases(token, user.id, 1);
      await waitUntilBadgeUnlocked(user.id);

      const [firstUnlocked] = await userAchievementRepo.find({
        where: { userId: user.id },
      });
      expect(firstUnlocked).toBeDefined();

      const badgeRowsAfterFirst = await userBadgeRepo.find({
        where: { userId: user.id },
      });

      // Buy more, but stay under the next threshold (5). This makes the
      // listener re-check this same user again and again.
      await purchaseOnce(token, product.id);
      await purchaseOnce(token, product.id);
      await waitUntilBadgeUnlocked(user.id);

      const rowsForFirstAchievement = await userAchievementRepo.count({
        where: { userId: user.id, achievementId: firstUnlocked.achievementId },
      });
      expect(rowsForFirstAchievement).toBe(1);

      const badgeRowsAfterMore = await userBadgeRepo.find({
        where: { userId: user.id },
      });
      expect(badgeRowsAfterMore.length).toBe(badgeRowsAfterFirst.length);
      if (badgeRowsAfterFirst.length > 0) {
        const ids = badgeRowsAfterFirst.map((b) => b.badgeId).sort();
        const idsAfter = badgeRowsAfterMore.map((b) => b.badgeId).sort();
        expect(idsAfter).toEqual(ids);
      }
    } finally {
      rememberForCleanup(user.id, product.id);
    }
  });

  // Test case 4
  // Check thet getUserAchievements endpoint returns the correct achievements and badge summary
  it('Returns the correct achievements and badge summary', async () => {
    const product = await createCheapTestProduct(20);
    const user = await createTestUser(100_000n);

    try {
      const token = await loginAs(user.username);

      await purchaseOnce(token, product.id);
      await waitUntilAchievementIncreases(token, user.id, 1);
      const expected = await waitUntilBadgeUnlocked(user.id);
      const actual = await getAchievements(token, user.id);

      expect(Array.isArray(actual.unlocked_achievements)).toBe(true);
      expect(Array.isArray(actual.next_available_achievements)).toBe(true);
      expect(
        actual.current_badge === null || typeof actual.current_badge === 'string',
      ).toBe(true);
      expect(typeof actual.remaining_to_unlock_next_badge).toBe('number');

      expectSameAchievementsResponse(actual, expected);
    } finally {
      rememberForCleanup(user.id, product.id);
    }
  });
});
