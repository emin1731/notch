import type { NestExpressApplication } from '@nestjs/platform-express';
import type { HabitStatsDto, StatsOverviewDto } from '@notch/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from '../src/auth/password.service.js';
import { DEMO_PASSWORD, DEMO_USERNAME, seedDemo } from '../src/cli/demo-seed.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { loginAs, resetDb } from './helpers/auth.js';
import type { TestClient } from './helpers/test-client.js';

/**
 * The demo seed on Thursday 2026-11-19 (Berlin), as in today.e2e-spec.ts. History starts Monday
 * 09-21; this week starts Monday 11-16. The rules: a habit's last day (today) counts only once it's
 * a hit, times-per-week habits count whole weeks and the current week only once its quota is met,
 * and bonus logs never count. Every expected number is worked out by hand from src/cli/demo-seed.ts.
 */
describe('stats (e2e)', () => {
  let app: NestExpressApplication;
  let client: TestClient;
  let habitIds: Record<string, string>;

  const overview = async (range: string) => {
    const res = await client.get(`/stats/overview?range=${range}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StatsOverviewDto;
  };
  const habit = async (name: string, range: string) => {
    const res = await client.get(`/stats/habits/${habitIds[name]}?range=${range}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as HabitStatsDto;
  };
  const rates = async (range: string) =>
    Object.fromEntries(
      await Promise.all(
        Object.keys(habitIds).map(async (name) => [name, (await habit(name, range)).rate] as const),
      ),
    );

  beforeAll(async () => {
    app = await createTestApp({ now: '2026-11-19T09:00:00Z' });
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

  // 7d = Fri 11-13 … Thu 11-19.
  const RATES_7D = {
    'Cold shower': 6 / 7, // missed Sat 11-14; today done
    Read: 5 / 6, // 10/25 pages on Wed 11-18; today not done yet, so not counted
    Meditate: 1, // 6 days; today half done, not counted
    Gym: 1, // week 11-09: 3/3; this week 2/3 so far, not counted yet
    Strength: 1, // Fri 13, Mon 16, Wed 18
    'Deep work': 0.25, // week 11-09: 1/4; this week 3/4 so far, not counted yet
    Journal: 1, // Sat 14, Sun 15
  };
  // 90d (08-22 …) covers the whole history from 09-21, so 365d is the same.
  const RATES_FULL = {
    'Cold shower': 59 / 60,
    Read: 58 / 59,
    Meditate: 1,
    Gym: 1, // 8 full weeks at 3/3
    Strength: 1,
    'Deep work': 29 / 32, // 7 weeks at 4/4, then 1/4
    Journal: 1,
  };
  const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  it('7d: per-habit and overall rates', async () => {
    expect(await rates('7d')).toEqual(RATES_7D);
    const stats = await overview('7d');
    expect(stats).toMatchObject({ range: '7d', from: '2026-11-13', to: '2026-11-19' });
    expect(stats.overallRate).toBeCloseTo(mean(Object.values(RATES_7D)));
  });

  it('7d: per core, daily series, streaks and changes', async () => {
    const stats = await overview('7d');
    expect(stats.cores.map((core) => [core.name, core.rate])).toEqual([
      ['Health', (6 / 7 + 1 + 1) / 3],
      ['Mind', (5 / 6 + 1 + 1) / 3],
      ['Career', 0.25],
    ]);
    // Due daily/specific-day habits each day, hits / due (today: only Cold shower is done).
    expect(stats.daily).toEqual([
      { date: '2026-11-13', rate: 1 }, // Cold, Read, Meditate, Strength
      { date: '2026-11-14', rate: 0.75 }, // Cold shower missed
      { date: '2026-11-15', rate: 1 },
      { date: '2026-11-16', rate: 1 },
      { date: '2026-11-17', rate: 1 },
      { date: '2026-11-18', rate: 0.75 }, // Read missed
      { date: '2026-11-19', rate: 1 },
    ]);
    expect(stats.topStreaks.map((h) => [h.name, h.currentStreak])).toEqual([
      ['Meditate', 59],
      ['Strength', 21],
      ['Journal', 16],
      ['Gym', 8],
      ['Cold shower', 5],
    ]);
    expect(stats.changes).toEqual({ levelUps: 0, deloads: 1 }); // Deep work, Monday
  });

  it('90d and 365d: the whole history', async () => {
    expect(await rates('90d')).toEqual(RATES_FULL);
    expect(await rates('365d')).toEqual(RATES_FULL);
    const stats = await overview('90d');
    expect(stats.overallRate).toBeCloseTo(mean(Object.values(RATES_FULL)));
    expect(stats.cores.map((core) => core.rate)).toEqual([
      (59 / 60 + 1 + 1) / 3,
      (58 / 59 + 1 + 1) / 3,
      29 / 32,
    ]);
    // Meditate and Deep work levelled up twice each; Deep work deloaded on Monday.
    expect(stats.changes).toEqual({ levelUps: 4, deloads: 1 });
    expect(stats.daily).toHaveLength(90);
    expect(stats.daily[0]).toEqual({ date: '2026-08-22', rate: null }); // before any habit
  });

  it('30d: weekly habits count the whole first week the range touches', async () => {
    // 10-21 … 11-19. Weekly habits: weeks 10-19, 10-26, 11-02, 11-09 (+ this week, not met).
    const deepWork = await habit('Deep work', '30d');
    expect(deepWork).toMatchObject({ hits: 13, occurrences: 16, rate: 13 / 16 });
    expect(await habit('Gym', '30d')).toMatchObject({ hits: 12, occurrences: 12 });
    expect((await habit('Cold shower', '30d')).rate).toBe(29 / 30);
  });

  it('habit detail: target series, heatmap and totals', async () => {
    const deepWork = await habit('Deep work', '90d');
    expect(deepWork).toMatchObject({
      from: '2026-09-21',
      to: '2026-11-19',
      field: 'TARGET_VALUE',
      longestStreak: 7,
      currentStreak: 0,
    });
    expect(deepWork.targetSeries).toEqual([
      { date: '2026-09-21', target: 3000 },
      { date: '2026-10-05', target: 3300 },
      { date: '2026-10-19', target: 3600 },
      { date: '2026-11-16', target: 3300 },
    ]);
    expect((await habit('Gym', '90d')).targetSeries).toEqual([{ date: '2026-09-21', target: 3 }]);
    expect((await habit('Gym', '90d')).field).toBe('TIMES_PER_WEEK');

    // Strength was Tue/Thu until 10-26, Mon/Wed/Fri since.
    const strength = await habit('Strength', '30d');
    const day = (date: string) => strength.heatmap.find((entry) => entry.date === date);
    expect(day('2026-10-22')).toEqual({
      date: '2026-10-22',
      value: 30,
      target: 30,
      hit: true,
      scheduled: true,
    }); // Thu, old
    expect(day('2026-10-23')).toMatchObject({ value: 0, scheduled: false }); // Fri, old
    expect(day('2026-10-26')).toMatchObject({ value: 30, scheduled: true }); // Mon, new
    expect(day('2026-10-27')).toMatchObject({ value: 0, scheduled: false }); // Tue, new
    expect(strength.heatmap).toHaveLength(30);

    // 6 × 10 min, plus 5 min today.
    expect((await habit('Meditate', '7d')).totalValue).toBe(6 * 600 + 300);
  });

  it('a bonus log shows in the heatmap but never counts', async () => {
    const before = await habit('Strength', '7d');
    await app.get(PrismaService).habitLog.create({
      data: {
        habitId: habitIds.Strength!,
        userId: (await client.get('/auth/me')).body.id,
        date: new Date('2026-11-17T00:00:00Z'), // a Tuesday
        value: 30,
        targetSnapshot: 30,
      },
    });
    const after = await habit('Strength', '7d');
    expect(after.heatmap.find((entry) => entry.date === '2026-11-17')).toEqual({
      date: '2026-11-17',
      value: 30,
      target: 30,
      hit: true,
      scheduled: false,
    });
    expect([after.hits, after.occurrences, after.rate]).toEqual([
      before.hits,
      before.occurrences,
      before.rate,
    ]);
    expect(after.totalValue).toBe(before.totalValue + 30);
    expect((await overview('7d')).daily.find((point) => point.date === '2026-11-17')!.rate).toBe(1);
  });

  it('archived habits keep their history but leave the streak board', async () => {
    const before = await overview('7d');
    await client.post(`/habits/${habitIds.Journal}/archive`);
    const after = await overview('7d');
    expect(after.overallRate).toBe(before.overallRate);
    expect(after.cores).toEqual(before.cores);
    expect(after.topStreaks.map((h) => h.name)).toEqual([
      'Meditate',
      'Strength',
      'Gym',
      'Cold shower',
    ]);
    expect(await habit('Journal', '7d')).toMatchObject({
      rate: 1,
      currentStreak: 0,
      longestStreak: 16,
    });
  });

  it('validates the range', async () => {
    expect((await client.get('/stats/overview?range=14d')).body.code).toBe('VALIDATION_FAILED');
    expect((await client.get('/stats/overview')).body.range).toBe('30d');
  });
});
