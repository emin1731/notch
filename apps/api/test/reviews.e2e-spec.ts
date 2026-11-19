import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  addDays,
  type HabitDetailDto,
  type ReviewDto,
  type ReviewListDto,
  type TodayResponse,
  type UndoResult,
} from '@notch/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service.js';
import { DEMO_PASSWORD, DEMO_USERNAME, seedDemo } from '../src/cli/demo-seed.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, type TestClock, testClock } from './create-test-app.js';
import { loginAs, registerUser, resetDb } from './helpers/auth.js';
import { createCore, createHabit } from './helpers/structure.js';
import type { TestClient } from './helpers/test-client.js';

const byName = (review: ReviewDto) =>
  Object.fromEntries(
    review.summary.habits.map((habit) => [habit.name, [habit.decision, habit.reason, habit.rate]]),
  );
const allHabits = (today: TodayResponse) => [
  ...today.groups.flatMap((group) => group.habits),
  ...today.weeklyQuota,
];

describe('weekly review of the demo seed, on Monday morning (e2e)', () => {
  // Monday 2026-11-16, 08:00 in Berlin. The seed stops at the end of Sunday: last week (11-09) is
  // logged but not reviewed yet, as if the user hasn't opened the app since.
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let client: TestClient;
  let habitIds: Record<string, string>;

  beforeAll(async () => {
    app = await createTestApp({ now: '2026-11-16T07:00:00Z' });
    prisma = app.get(PrismaService);
    await resetDb(app);
    const passwordHash = await app.get(PasswordService).hash(DEMO_PASSWORD);
    ({ habitIds } = await seedDemo(app, {
      today: '2026-11-16',
      timezone: 'Europe/Berlin',
      passwordHash,
      pendingMonday: true,
    }));
    client = await loginAs(app, DEMO_USERNAME, DEMO_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('the first visit of the week reviews last week', async () => {
    expect(await prisma.weeklyReview.count()).toBe(7);
    const today = (await client.get('/today')).body as TodayResponse;
    expect(await prisma.weeklyReview.count()).toBe(8);
    expect(today.pendingReview?.weekStart).toBe('2026-11-09');
    expect(today.welcomeBack).toBe(false);
  });

  it('decides per habit by the plan 2.7 rules', async () => {
    const review = (await client.get('/reviews/latest')).body.review as ReviewDto;
    expect(review.weekStart).toBe('2026-11-09');
    expect(review.inactive).toBe(false);
    expect(byName(review)).toEqual({
      'Cold shower': ['HOLD', 'NOT_ADAPTIVE', 6 / 7], // missed Wednesday
      Read: ['HOLD', 'NOT_ADAPTIVE', 6 / 7], // adaptive off; 10 of 25 pages on Sunday
      Meditate: ['HOLD', 'AT_MAX', 1], // reached its max of 10 min four weeks ago
      Gym: ['HOLD', 'AT_MAX', 1],
      Strength: ['HOLD', 'AT_MAX', 1],
      'Deep work': ['DELOAD', 'STRUGGLING', 0.25], // 1 of 4 sessions
      Journal: ['HOLD', 'NOT_ADAPTIVE', 1],
    });
    expect(review.summary.overallRate).toBeCloseTo((6 / 7 + 6 / 7 + 1 + 1 + 1 + 0.25 + 1) / 7);
    expect(review.changes).toEqual([
      expect.objectContaining({
        habitName: 'Deep work',
        kind: 'DELOAD',
        field: 'TARGET_VALUE',
        fromValue: 3600,
        toValue: 3300, // back to the value before its last level-up
        effectiveFrom: '2026-11-16',
        undoDeadline: '2026-11-22T23:00:00.000Z', // Monday 11-23, 00:00 in Berlin
        canUndo: true,
        undoBlockedReason: null,
      }),
    ]);
  });

  it('the history holds the earlier reviews’ level-ups', async () => {
    const changes = async (name: string) =>
      (
        (await client.get(`/habits/${habitIds[name]}/target-history`)).body as {
          kind: string;
          fromValue: number;
          toValue: number;
          effectiveFrom: string;
        }[]
      ).map((change) => [change.kind, change.fromValue, change.toValue, change.effectiveFrom]);
    expect(await changes('Meditate')).toEqual([
      ['LEVEL_UP', 480, 540, '2026-10-05'], // 8 → 9 min, rounded to whole minutes
      ['LEVEL_UP', 540, 600, '2026-10-19'],
    ]);
    expect(await changes('Deep work')).toEqual([
      ['LEVEL_UP', 3000, 3300, '2026-10-05'],
      ['LEVEL_UP', 3300, 3600, '2026-10-19'], // capped at its max of 60 min
      ['DELOAD', 3600, 3300, '2026-11-16'],
    ]);
  });

  it('Today shows the change, undoable until logged at the new level', async () => {
    const today = (await client.get('/today')).body as TodayResponse;
    const deepWork = today.weeklyQuota.find((habit) => habit.name === 'Deep work')!;
    expect(deepWork).toMatchObject({
      target: 3300,
      change: { kind: 'DELOAD', fromValue: 3600, toValue: 3300, canUndo: true },
    });
    expect(allHabits(today).filter((habit) => habit.change)).toHaveLength(1);
  });

  it('undo restores the old target, once', async () => {
    const review = (await client.get('/reviews/latest')).body.review as ReviewDto;
    const changeId = review.changes[0]!.id;

    const res = await client.post(`/target-changes/${changeId}/undo`);
    expect(res.status).toBe(200);
    const undone = res.body as UndoResult;
    expect(undone.habit.targetValue).toBe(3600);
    expect(undone.change.undoneAt).toEqual(expect.any(String));

    const deepWork = ((await client.get('/today')).body as TodayResponse).weeklyQuota.find(
      (h) => h.name === 'Deep work',
    )!;
    expect(deepWork.target).toBe(3600);
    expect(deepWork.change).toBeUndefined();

    const again = await client.post(`/target-changes/${changeId}/undo`);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({
      code: 'UNDO_NOT_ALLOWED',
      details: { reason: 'ALREADY_UNDONE' },
    });
  });

  it('lists reviews newest first, by page', async () => {
    const first = (await client.get('/reviews?limit=3')).body as ReviewListDto;
    expect(first.items.map((review) => review.weekStart)).toEqual([
      '2026-11-09',
      '2026-11-02',
      '2026-10-26',
    ]);
    expect(first.nextCursor).toBe('2026-10-26');
    const rest = (await client.get(`/reviews?limit=10&cursor=${first.nextCursor}`))
      .body as ReviewListDto;
    expect(rest.items.map((review) => review.weekStart)).toEqual([
      '2026-10-19',
      '2026-10-12',
      '2026-10-05',
      '2026-09-28',
      '2026-09-21',
    ]);
    expect(rest.nextCursor).toBeNull();
  });

  it('opening the review hides the banner', async () => {
    const review = (await client.get('/reviews/2026-11-09')).body as ReviewDto;
    expect(review.seenAt).toBeNull();
    const seen = await client.post(`/reviews/${review.id}/seen`);
    expect(seen.body.seenAt).toEqual(expect.any(String));
    expect(((await client.get('/today')).body as TodayResponse).pendingReview).toBeNull();
    expect((await client.get('/reviews/2026-11-10')).body.code).toBe('REVIEW_NOT_FOUND');
  });
});

describe('weekly reviews, day by day (e2e)', () => {
  // Users are in UTC here, so local midnight is 00:00Z. Weeks: 10-26, 11-02, 11-09, 11-16 (Mondays).
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let clock: TestClock;
  let client: TestClient;

  beforeAll(async () => {
    app = await createTestApp({ now: '2026-10-26T09:00:00Z' });
    prisma = app.get(PrismaService);
    clock = testClock(app);
  });

  beforeEach(async () => {
    clock.set('2026-10-26T09:00:00Z');
    await resetDb(app);
    ({ client } = await registerUser(app, 'alice', { timezone: 'UTC' }));
  });

  afterAll(async () => {
    await app.close();
  });

  /** Moves the clock through each day and logs `value` that day, like a real user would. */
  const logDays = async (habitId: string, from: string, days: number, value: number, hour = 12) => {
    for (let offset = 0; offset < days; offset += 1) {
      const date = addDays(from, offset);
      clock.set(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
      const res = await client.put(`/habits/${habitId}/logs/${date}`, { value });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
    }
  };
  const reviewOf = async (weekStart: string) =>
    (await client.get(`/reviews/${weekStart}`)).body as ReviewDto;
  const reviewWeeks = async () =>
    (await prisma.weeklyReview.findMany({ orderBy: { weekStart: 'asc' } })).map((r) =>
      r.weekStart.toISOString().slice(0, 10),
    );
  const undo = (id: string) => client.post(`/target-changes/${id}/undo`);

  /** A daily 20-page habit hit every day of the weeks of 10-26 and 11-02. */
  const twoGoodWeeks = async () => {
    const core = await createCore(client);
    const habit = await createHabit(client, core.id);
    await logDays(habit.id, '2026-10-26', 14, 20);
    return habit;
  };

  it('two full weeks level a habit up; the review runs before the first log of the week', async () => {
    const habit = await twoGoodWeeks();
    // The first week's review couldn't compare with a week before: STEADY.
    expect(byName(await reviewOf('2026-10-26'))).toEqual({ Read: ['HOLD', 'STEADY', 1] });

    clock.set('2026-11-09T08:00:00Z');
    const res = await client.put(`/habits/${habit.id}/logs/2026-11-09`, { value: 22 });
    // Logged against the new target: the review ran first.
    expect(res.body.log).toEqual({ date: '2026-11-09', value: 22, targetSnapshot: 22 });
    const review = await reviewOf('2026-11-02');
    expect(byName(review)).toEqual({ Read: ['LEVEL_UP', 'CONSISTENT', 1] });
    expect(review.changes[0]).toMatchObject({
      fromValue: 20,
      toValue: 22,
      canUndo: false,
      undoBlockedReason: 'ALREADY_LOGGED',
    });
    expect((await undo(review.changes[0]!.id)).body.details.reason).toBe('ALREADY_LOGGED');
  });

  it('a log set back to 0 is gone, so undo is still allowed', async () => {
    const habit = await twoGoodWeeks();
    clock.set('2026-11-09T08:00:00Z');
    await client.get('/today');
    await client.put(`/habits/${habit.id}/logs/2026-11-09`, { value: 5 });
    await client.put(`/habits/${habit.id}/logs/2026-11-09`, { value: 0 });
    const change = (await reviewOf('2026-11-02')).changes[0]!;
    expect(change.canUndo).toBe(true);
    const res = await undo(change.id);
    expect(res.status).toBe(200);
    expect((res.body as UndoResult).habit.targetValue).toBe(20);
  });

  it('undo expires exactly at the end of the week the change applies to', async () => {
    await twoGoodWeeks();
    clock.set('2026-11-15T23:59:59.999Z');
    const change = ((await client.get('/reviews/latest')).body.review as ReviewDto).changes[0]!;
    expect(change).toMatchObject({ undoDeadline: '2026-11-16T00:00:00.000Z', canUndo: true });

    clock.set('2026-11-16T00:00:00Z');
    expect((await reviewOf('2026-11-02')).changes[0]).toMatchObject({
      canUndo: false,
      undoBlockedReason: 'EXPIRED',
    });
    expect((await undo(change.id)).body.details.reason).toBe('EXPIRED');
  });

  it('manual changes and edited habits can’t be undone', async () => {
    const habit = await twoGoodWeeks();
    clock.set('2026-11-09T08:00:00Z');
    const change = ((await client.get('/reviews/latest')).body.review as ReviewDto).changes[0]!;

    const edited = (await client.patch(`/habits/${habit.id}`, { targetValue: 30 }))
      .body as HabitDetailDto;
    expect((await undo(change.id)).body.details.reason).toBe('CHANGED_SINCE');

    const manual = edited.recentChanges.find((c) => c.kind === 'MANUAL')!;
    expect((await undo(manual.id)).body.details.reason).toBe('NOT_AUTOMATIC');
  });

  it('after an undone level-up, the next review holds (cooldown)', async () => {
    const habit = await twoGoodWeeks();
    clock.set('2026-11-09T08:00:00Z');
    const change = ((await client.get('/reviews/latest')).body.review as ReviewDto).changes[0]!;
    expect((await undo(change.id)).status).toBe(200);

    await logDays(habit.id, '2026-11-09', 7, 20);
    clock.set('2026-11-16T08:00:00Z');
    await client.get('/today');
    expect(byName(await reviewOf('2026-11-09'))).toEqual({ Read: ['HOLD', 'COOLDOWN', 1] });
    expect((await client.get(`/habits/${habit.id}`)).body.targetValue).toBe(20);
  });

  it('a week with no logs at all is inactive: nothing changes, and Today says welcome back', async () => {
    const core = await createCore(client);
    const read = await createHabit(client, core.id);
    await createHabit(client, core.id, {
      name: 'Run',
      type: 'TOGGLE',
      unit: undefined,
      targetValue: undefined,
      scheduleType: 'TIMES_PER_WEEK',
      timesPerWeek: 3,
    });
    await logDays(read.id, '2026-10-26', 7, 20);

    clock.set('2026-11-09T08:00:00Z');
    const today = (await client.get('/today')).body as TodayResponse;
    const review = await reviewOf('2026-11-02');
    expect(review.inactive).toBe(true);
    expect(byName(review)).toEqual({
      Read: ['HOLD', 'INACTIVE_WEEK', 0],
      Run: ['HOLD', 'INACTIVE_WEEK', 0],
    });
    expect(today).toMatchObject({ welcomeBack: true, pendingReview: { weekStart: '2026-11-02' } });

    await client.post(`/reviews/${review.id}/seen`);
    expect(((await client.get('/today')).body as TodayResponse).welcomeBack).toBe(false);
  });

  it('no review for a first week in which no habit existed for the whole week', async () => {
    clock.set('2026-10-28T09:00:00Z'); // a Wednesday
    const core = await createCore(client);
    const habit = await createHabit(client, core.id);
    await logDays(habit.id, '2026-10-28', 5, 20);

    clock.set('2026-11-02T08:00:00Z');
    const today = (await client.get('/today')).body as TodayResponse;
    expect(today).toMatchObject({ pendingReview: null, welcomeBack: false });
    expect((await client.get('/reviews/latest')).body).toEqual({ review: null });
    expect(await reviewWeeks()).toEqual([]);
  });

  it('archived habits are left out', async () => {
    const habit = await twoGoodWeeks();
    const core = (await client.get('/cores')).body[0];
    const other = await createHabit(client, core.id, { name: 'Other', startDate: '2026-11-02' });
    await client.post(`/habits/${habit.id}/archive`);
    clock.set('2026-11-09T08:00:00Z');
    await client.get('/today');
    expect((await reviewOf('2026-11-02')).summary.habits.map((h) => h.habitId)).toEqual([other.id]);
  });

  it('after weeks away, only the last week is reviewed', async () => {
    await twoGoodWeeks();
    clock.set('2026-11-30T08:00:00Z');
    await client.get('/today');
    expect(await reviewWeeks()).toEqual(['2026-10-26', '2026-11-23']);
    expect((await reviewOf('2026-11-23')).inactive).toBe(true);
  });

  it('concurrent first visits create one review and change the target once', async () => {
    const habit = await twoGoodWeeks();
    clock.set('2026-11-09T08:00:00Z');
    const results = await Promise.all(Array.from({ length: 5 }, () => client.get('/today')));
    expect(results.every((res) => res.status === 200)).toBe(true);
    expect(await prisma.weeklyReview.count({ where: { weekStart: new Date('2026-11-02') } })).toBe(
      1,
    );
    expect(await prisma.targetChange.count({ where: { kind: 'LEVEL_UP' } })).toBe(1);
    expect((await client.get(`/habits/${habit.id}`)).body.targetValue).toBe(22);
  });
});

describe('review timing across timezones (e2e)', () => {
  let app: NestExpressApplication;
  let clock: TestClock;

  beforeAll(async () => {
    app = await createTestApp({ now: '2026-11-02T20:00:00Z' });
    clock = testClock(app);
  });

  beforeEach(async () => {
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const weeks = async () =>
    (await app.get(PrismaService).weeklyReview.findMany({ orderBy: { weekStart: 'asc' } })).map(
      (r) => r.weekStart.toISOString().slice(0, 10),
    );

  it('a review starts at Monday 00:00 in the user’s timezone (Los Angeles)', async () => {
    clock.set('2026-11-02T20:00:00Z'); // Monday 12:00 in LA
    const { client } = await registerUser(app, 'losangeles', { timezone: 'America/Los_Angeles' });
    await createHabit(client, (await createCore(client)).id);

    clock.set('2026-11-16T07:59:00Z'); // Sunday 23:59 in LA
    await client.get('/today');
    expect(await weeks()).toEqual(['2026-11-02']);

    clock.set('2026-11-16T08:00:00Z'); // Monday 00:00 in LA (PST)
    await client.get('/today');
    expect(await weeks()).toEqual(['2026-11-02', '2026-11-09']);
  });

  it('across the Berlin DST switch: the review and the undo deadline use local midnight', async () => {
    clock.set('2026-10-12T10:00:00Z');
    const { client } = await registerUser(app, 'berlin', { timezone: 'Europe/Berlin' });
    const habit = await createHabit(client, (await createCore(client)).id);
    for (let offset = 0; offset < 14; offset += 1) {
      const date = addDays('2026-10-12', offset);
      clock.set(`${date}T10:00:00Z`);
      await client.put(`/habits/${habit.id}/logs/${date}`, { value: 20 });
    }

    clock.set('2026-10-25T22:59:00Z'); // Sunday 23:59 CET, the day summer time ended
    await client.get('/today');
    expect(await weeks()).toEqual(['2026-10-12']);

    clock.set('2026-10-25T23:00:00Z'); // Monday 00:00 CET
    await client.get('/today');
    expect(await weeks()).toEqual(['2026-10-12', '2026-10-19']);
    const review = (await client.get('/reviews/2026-10-19')).body as ReviewDto;
    expect(review.changes[0]).toMatchObject({
      kind: 'LEVEL_UP',
      effectiveFrom: '2026-10-26',
      undoDeadline: '2026-11-01T23:00:00.000Z', // Monday 11-02, 00:00 CET
    });
  });
});
