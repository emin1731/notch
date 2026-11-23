import { addDays, todayIn } from '@notch/shared';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { API_PREFIX } from '../src/setup-app.js';
import { createTestApp } from './create-test-app.js';
import { PASSWORD, registerUser, resetDb } from './helpers/auth.js';
import { createCore, createHabit } from './helpers/structure.js';
import type { TestClient } from './helpers/test-client.js';

interface AliceIds {
  core: string;
  habit: string;
  today: string;
  review: string;
  reviewWeek: string;
  change: string;
  bobCore: string;
  bobHabit: string;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Every route that takes an id, called by Bob with Alice's ids: always 404, never 403, and Alice's
 * data doesn't change. Later sprints add their routes here.
 */
const ROUTES: [Method, (ids: AliceIds) => string, (ids: AliceIds) => object | undefined, string][] =
  [
    ['patch', (ids) => `/cores/${ids.core}`, () => ({ name: 'Mine now' }), 'CORE_NOT_FOUND'],
    ['put', () => '/cores/order', (ids) => ({ ids: [ids.core] }), 'CORE_NOT_FOUND'],
    ['post', (ids) => `/cores/${ids.core}/archive`, () => undefined, 'CORE_NOT_FOUND'],
    ['post', (ids) => `/cores/${ids.core}/unarchive`, () => undefined, 'CORE_NOT_FOUND'],
    ['delete', (ids) => `/cores/${ids.core}`, () => undefined, 'CORE_NOT_FOUND'],
    [
      'post',
      () => '/habits',
      (ids) => ({ coreId: ids.core, name: 'X', type: 'TOGGLE', scheduleType: 'DAILY' }),
      'CORE_NOT_FOUND',
    ],
    [
      'patch',
      (ids) => `/habits/${ids.bobHabit}`,
      (ids) => ({ coreId: ids.core }),
      'CORE_NOT_FOUND',
    ],
    ['get', (ids) => `/habits/${ids.habit}`, () => undefined, 'HABIT_NOT_FOUND'],
    ['get', (ids) => `/habits/${ids.habit}/target-history`, () => undefined, 'HABIT_NOT_FOUND'],
    ['patch', (ids) => `/habits/${ids.habit}`, () => ({ targetValue: 99 }), 'HABIT_NOT_FOUND'],
    ['put', () => '/habits/order', (ids) => ({ ids: [ids.habit] }), 'HABIT_NOT_FOUND'],
    ['post', (ids) => `/habits/${ids.habit}/archive`, () => undefined, 'HABIT_NOT_FOUND'],
    ['post', (ids) => `/habits/${ids.habit}/unarchive`, () => undefined, 'HABIT_NOT_FOUND'],
    ['delete', (ids) => `/habits/${ids.habit}`, () => undefined, 'HABIT_NOT_FOUND'],
    ['get', (ids) => `/habits/${ids.habit}/logs`, () => undefined, 'HABIT_NOT_FOUND'],
    [
      'put',
      (ids) => `/habits/${ids.habit}/logs/${ids.today}`,
      () => ({ value: 5 }),
      'HABIT_NOT_FOUND',
    ],
    [
      'post',
      (ids) => `/habits/${ids.habit}/logs/${ids.today}/increment`,
      () => ({ delta: 1 }),
      'HABIT_NOT_FOUND',
    ],
    [
      'delete',
      (ids) => `/habits/${ids.habit}/logs/${ids.today}`,
      () => undefined,
      'HABIT_NOT_FOUND',
    ],
    ['get', (ids) => `/stats/habits/${ids.habit}`, () => undefined, 'HABIT_NOT_FOUND'],
    ['get', (ids) => `/reviews/${ids.reviewWeek}`, () => undefined, 'REVIEW_NOT_FOUND'],
    ['post', (ids) => `/reviews/${ids.review}/seen`, () => undefined, 'REVIEW_NOT_FOUND'],
    [
      'post',
      (ids) => `/target-changes/${ids.change}/undo`,
      () => undefined,
      'TARGET_CHANGE_NOT_FOUND',
    ],
  ];

/**
 * Alice's review of an old week with an undoable level-up, written directly: the app would only
 * create one after a full week of history.
 */
async function aliceReview(app: NestExpressApplication, habitId: string) {
  const prisma = app.get(PrismaService);
  const habit = await prisma.habit.findUniqueOrThrow({ where: { id: habitId } });
  const reviewWeek = '2026-01-05';
  const review = await prisma.weeklyReview.create({
    data: { userId: habit.userId, weekStart: new Date(`${reviewWeek}T00:00:00Z`), summary: {} },
  });
  const change = await prisma.targetChange.create({
    data: {
      habitId,
      weeklyReviewId: review.id,
      kind: 'LEVEL_UP',
      field: 'TARGET_VALUE',
      fromValue: habit.targetValue - 1,
      toValue: habit.targetValue,
      effectiveFrom: new Date('2026-01-12T00:00:00Z'),
      undoDeadline: new Date('2099-01-01T00:00:00Z'),
    },
  });
  return { review: review.id, reviewWeek, change: change.id };
}

/** Every route Express has registered, with a matcher for concrete paths. */
function registeredRoutes(app: NestExpressApplication) {
  const router = (app.getHttpAdapter().getInstance() as { router: { stack: RouterLayer[] } })
    .router;
  return router.stack.flatMap((layer) =>
    layer.route
      ? Object.keys(layer.route.methods).map((method) => ({
          method,
          path: layer.route!.path,
          pattern: new RegExp(`^${layer.route!.path.replace(/:[A-Za-z]+/g, '[^/]+')}$`),
        }))
      : [],
  );
}

interface RouterLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

describe('ownership (e2e)', () => {
  let app: NestExpressApplication;
  let alice: TestClient;
  let bob: TestClient;
  let ids: AliceIds;
  let snapshot: () => Promise<unknown>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    ({ client: alice } = await registerUser(app, 'alice'));
    ({ client: bob } = await registerUser(app, 'bob'));

    const core = await createCore(alice);
    const bobCore = await createCore(bob);
    const today = todayIn('Asia/Baku', new Date());
    // Starts later, so Bob's today and stats stay empty.
    const bobHabit = await createHabit(bob, bobCore.id, { startDate: addDays(today, 30) });
    const habit = await createHabit(alice, core.id);
    ids = {
      core: core.id,
      habit: habit.id,
      today,
      ...(await aliceReview(app, habit.id)),
      bobCore: bobCore.id,
      bobHabit: bobHabit.id,
    };

    snapshot = async () => ({
      cores: (await alice.get('/cores?includeArchived=true')).body,
      habit: (await alice.get(`/habits/${ids.habit}`)).body,
      logs: (await alice.get(`/habits/${ids.habit}/logs`)).body,
      review: (await alice.get(`/reviews/${ids.reviewWeek}`)).body,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ROUTES)('%s %s → 404', async (method, path, body, code) => {
    const before = await snapshot();
    const res = await bob[method](path(ids), body(ids));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(code);
    expect(await snapshot()).toEqual(before);
  });

  it('covers every route that takes an id in its path', () => {
    const tested = ROUTES.map(([method, path]) => [method, `/${API_PREFIX}${path(ids)}`] as const);
    const untested = registeredRoutes(app)
      .filter((route) => route.path.includes(':'))
      .filter(
        (route) =>
          !tested.some(([method, path]) => method === route.method && route.pattern.test(path)),
      )
      .map((route) => `${route.method.toUpperCase()} ${route.path}`);
    expect(untested).toEqual([]);
  });

  it("lists never include another user's records", async () => {
    expect((await bob.get(`/habits?coreId=${ids.core}&includeArchived=true`)).body).toEqual([]);
    expect((await bob.get('/today')).body).toMatchObject({ groups: [], weeklyQuota: [] });
    const bobCores = (await bob.get('/cores?includeArchived=true')).body;
    expect(bobCores.map((core: { id: string }) => core.id)).toEqual([ids.bobCore]);
    expect((await bob.get('/reviews')).body).toEqual({ items: [], nextCursor: null });
    expect((await bob.get('/reviews/latest')).body).toEqual({ review: null });
    const stats = (await bob.get('/stats/overview?range=365d')).body;
    expect(stats).toMatchObject({ overallRate: null, cores: [], topStreaks: [] });
    expect(JSON.stringify(stats)).not.toContain(ids.habit);
  });

  it('deleting an account removes everything it owns, and nothing else', async () => {
    const prisma = app.get(PrismaService);
    await alice.patch(`/habits/${ids.habit}`, { targetValue: 30 });
    await alice.put(`/habits/${ids.habit}/logs/${ids.today}`, { value: 5 });
    expect(await prisma.habitLog.count()).toBe(1);
    const res = await alice.delete('/me', { password: PASSWORD });
    expect(res.status).toBe(204);
    expect(await prisma.core.count({ where: { id: ids.core } })).toBe(0);
    expect(await prisma.habit.count({ where: { id: ids.habit } })).toBe(0);
    expect(await prisma.habitLog.count()).toBe(0);
    expect(await prisma.weeklyReview.count()).toBe(0);
    expect(await prisma.targetChange.count()).toBe(0);
    expect(await prisma.habit.count({ where: { id: ids.bobHabit } })).toBe(1);
  });
});
