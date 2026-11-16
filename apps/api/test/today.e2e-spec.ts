import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TodayHabit, TodayResponse } from '@notch/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service.js';
import { DEMO_PASSWORD, DEMO_USERNAME, seedDemo } from '../src/cli/demo-seed.js';
import { createTestApp } from './create-test-app.js';
import { loginAs, registerUser, resetDb } from './helpers/auth.js';
import type { TestClient } from './helpers/test-client.js';

/**
 * The demo seed at a fixed instant: Thursday 2026-11-19, 10:00 in Berlin. The habits start on
 * Monday 2026-09-21, 8 weeks before this week (which starts Monday 2026-11-16). Every number
 * below is worked out by hand from the seed's pattern in src/cli/demo-seed.ts.
 */
const NOW = '2026-11-19T09:00:00Z';

/** The fields worth comparing, by habit name. */
const summary = (habits: TodayHabit[]) =>
  Object.fromEntries(
    habits.map((habit) => [
      habit.name,
      {
        target: habit.target,
        value: habit.log?.value ?? null,
        progress: habit.progress,
        streak: habit.currentStreak,
        ...(habit.week && { week: habit.week }),
      },
    ]),
  );

describe('today (e2e)', () => {
  let app: NestExpressApplication;
  let client: TestClient;
  let habitIds: Record<string, string>;

  beforeAll(async () => {
    app = await createTestApp({ now: NOW });
    await resetDb(app);
    const passwordHash = await app.get(PasswordService).hash(DEMO_PASSWORD);
    ({ habitIds } = await seedDemo(app, {
      today: '2026-11-19',
      timezone: 'Europe/Berlin',
      passwordHash,
    }));
    client = await loginAs(app, DEMO_USERNAME, DEMO_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('today: daily and specific-day habits due today, by time of day', async () => {
    const res = await client.get('/today');
    expect(res.status).toBe(200);
    const today = res.body as TodayResponse;

    expect(today.date).toBe('2026-11-19');
    expect(today.groups.map((group) => [group.timeOfDay, group.habits.map((h) => h.name)])).toEqual(
      [
        ['MORNING', ['Cold shower', 'Meditate']],
        ['EVENING', ['Read']],
      ],
    );
    // Strength (Mon/Wed/Fri) and Journal (Sat/Sun) aren't due on a Thursday.
    expect(summary(today.groups.flatMap((group) => group.habits))).toEqual({
      // Missed on Saturday the 14th: Sun–Thu is 5.
      'Cold shower': { target: 1, value: 1, progress: 1, streak: 5 },
      // Half done today, which doesn't break the streak: Sep 21 – Nov 18 is 59 days.
      Meditate: { target: 600, value: 300, progress: 0.5, streak: 59 },
      // Target 25 since the edit on Nov 2; 10 pages yesterday was a miss.
      Read: { target: 25, value: null, progress: 0, streak: 0 },
    });
    expect(today.dayProgress).toBe(0.5);
  });

  it('today: the weekly quota section', async () => {
    const today = (await client.get('/today')).body as TodayResponse;
    expect(summary(today.weeklyQuota)).toEqual({
      // Mon/Wed/Fri for 8 weeks; Mon/Tue so far this week, which doesn't break it.
      Gym: { target: 1, value: null, progress: 0, streak: 8, week: { hits: 2, quota: 3 } },
      // Only 1 of 4 last week, so Monday's review deloaded it from 3600 back to 3300 (the value
      // before its last level-up). Half an hour today isn't a hit.
      'Deep work': {
        target: 3300,
        value: 1800,
        progress: 1800 / 3300,
        streak: 0,
        week: { hits: 3, quota: 4 },
      },
    });
    // Logged at the new level since Monday, so the deload can't be undone any more.
    expect(today.weeklyQuota[1]!.change).toEqual({
      id: expect.any(String),
      kind: 'DELOAD',
      field: 'TARGET_VALUE',
      fromValue: 3600,
      toValue: 3300,
      canUndo: false,
    });
    expect(today.weeklyQuota[0]!.change).toBeUndefined();
    // Monday's review hasn't been opened yet; the earlier ones have.
    expect(today).toMatchObject({
      pendingReview: { id: expect.any(String), weekStart: '2026-11-09' },
      welcomeBack: false,
    });
    expect(today.weeklyQuota[0]).toMatchObject({
      core: { name: 'Health', color: 'emerald' },
      goal: { title: 'Run a half marathon' },
    });
  });

  it('yesterday, as it was then', async () => {
    const res = await client.get('/today?date=2026-11-18');
    const yesterday = res.body as TodayResponse;
    expect(
      yesterday.groups.map((group) => [group.timeOfDay, group.habits.map((h) => h.name)]),
    ).toEqual([
      ['MORNING', ['Cold shower', 'Meditate']],
      ['EVENING', ['Read']],
      ['ANYTIME', ['Strength']],
    ]);
    expect(summary(yesterday.groups.flatMap((group) => group.habits))).toEqual({
      'Cold shower': { target: 1, value: 1, progress: 1, streak: 4 },
      Meditate: { target: 600, value: 600, progress: 1, streak: 59 },
      // 10 of 25 that day; up to the day before, every day since Sep 21 was a hit (58).
      Read: { target: 25, value: 10, progress: 0.4, streak: 58 },
      // Tue/Thu for 5 weeks (10), then Mon/Wed/Fri: 9 + Mon and Wed this week. Reading the old
      // weekdays from the history is what keeps this from breaking at the edit.
      Strength: { target: 30, value: 30, progress: 1, streak: 21 },
    });
    expect(yesterday.dayProgress).toBeCloseTo((1 + 1 + 0.4 + 1) / 4);
    expect(summary(yesterday.weeklyQuota)['Deep work']).toEqual({
      target: 3300,
      value: 3300,
      progress: 1,
      streak: 0,
      week: { hits: 3, quota: 4 },
    });
  });

  it('stores the longest streaks', async () => {
    const longest = async (name: string) =>
      (await client.get(`/habits/${habitIds[name]}`)).body.longestStreak as number;
    expect(await longest('Cold shower')).toBe(54); // Sep 21 – Nov 13
    expect(await longest('Read')).toBe(58);
    expect(await longest('Meditate')).toBe(59);
    expect(await longest('Gym')).toBe(8);
    expect(await longest('Strength')).toBe(21);
    expect(await longest('Deep work')).toBe(7);
    expect(await longest('Journal')).toBe(16); // 8 weekends
  });

  it('only today and the 6 days before', async () => {
    expect((await client.get('/today?date=2026-11-13')).status).toBe(200);
    expect((await client.get('/today?date=2026-11-12')).body.code).toBe('BACKFILL_OUT_OF_RANGE');
    expect((await client.get('/today?date=2026-11-20')).body.code).toBe('BACKFILL_OUT_OF_RANGE');
    expect((await client.get('/today?date=soon')).body.code).toBe('VALIDATION_FAILED');
  });

  it('archived habits and other users never show up', async () => {
    await client.post(`/habits/${habitIds['Cold shower']}/archive`);
    const { client: other } = await registerUser(app, 'other');
    expect((await other.get('/today')).body).toMatchObject({
      dayProgress: null,
      groups: [],
      weeklyQuota: [],
    });
    const names = ((await client.get('/today')).body as TodayResponse).groups.flatMap((g) =>
      g.habits.map((h) => h.name),
    );
    expect(names).not.toContain('Cold shower');
  });
});
