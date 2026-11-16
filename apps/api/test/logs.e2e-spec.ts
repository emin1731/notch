import type { NestExpressApplication } from '@nestjs/platform-express';
import { addDays, type CoreDto, type LogWriteResult } from '@notch/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { registerUser, resetDb } from './helpers/auth.js';
import { createCore, createHabit } from './helpers/structure.js';
import type { TestClient } from './helpers/test-client.js';

// 13:00 in Asia/Baku (registerUser's timezone): the local today is 2026-11-19, a Thursday.
const NOW = '2026-11-19T09:00:00Z';
const TODAY = '2026-11-19';
const day = (offset: number) => addDays(TODAY, offset);

describe('logs (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let client: TestClient;
  let core: CoreDto;

  const put = (habitId: string, date: string, value: number) =>
    client.put(`/habits/${habitId}/logs/${date}`, { value });
  const inc = (habitId: string, date: string, delta: number) =>
    client.post(`/habits/${habitId}/logs/${date}/increment`, { delta });
  const result = (res: { status: number; body: unknown }) => {
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as LogWriteResult;
  };

  beforeAll(async () => {
    app = await createTestApp({ now: NOW });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    ({ client } = await registerUser(app));
    core = await createCore(client);
  });

  afterAll(async () => {
    await app.close();
  });

  const toggle = () =>
    createHabit(client, core.id, {
      name: 'Cold shower',
      type: 'TOGGLE',
      unit: undefined,
      targetValue: undefined,
    });

  it('a toggle switches on, and off deletes the log', async () => {
    const habit = await toggle();
    expect(result(await put(habit.id, TODAY, 1))).toEqual({
      log: { date: TODAY, value: 1, targetSnapshot: 1 },
      habitProgress: 1,
      currentStreak: 1,
      longestStreak: 1,
    });
    expect(result(await put(habit.id, TODAY, 0))).toEqual({
      log: null,
      habitProgress: 0,
      currentStreak: 0,
      longestStreak: 0,
    });
    expect(await prisma.habitLog.count()).toBe(0);
  });

  it('a counter goes up and down, and reaching 0 deletes the log', async () => {
    const habit = await createHabit(client, core.id);
    await inc(habit.id, TODAY, 5);
    expect(result(await inc(habit.id, TODAY, 5))).toMatchObject({
      log: { value: 10 },
      habitProgress: 0.5,
    });
    expect(result(await inc(habit.id, TODAY, -3)).log?.value).toBe(7);
    expect(result(await inc(habit.id, TODAY, -20)).log).toBeNull();
    expect(result(await inc(habit.id, TODAY, -1)).log).toBeNull();
    expect(await prisma.habitLog.count()).toBe(0);
  });

  it('caps values per habit type', async () => {
    const meditate = await createHabit(client, core.id, {
      name: 'Meditate',
      type: 'DURATION',
      unit: undefined,
      targetValue: 600,
    });
    expect(result(await inc(meditate.id, TODAY, 600)).habitProgress).toBe(1);
    expect(result(await inc(meditate.id, TODAY, 90_000)).log?.value).toBe(86_400);
    const tooMuch = await put(meditate.id, TODAY, 90_000);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.details.issues[0].path).toBe('value');

    const shower = await toggle();
    expect(result(await inc(shower.id, TODAY, 2)).log?.value).toBe(1);
    expect((await put(shower.id, TODAY, 2)).status).toBe(400);
  });

  it('setting overwrites the value but keeps the snapshot', async () => {
    const habit = await createHabit(client, core.id);
    await put(habit.id, TODAY, 15);
    await client.patch(`/habits/${habit.id}`, { targetValue: 30 });
    expect(result(await put(habit.id, TODAY, 8)).log).toEqual({
      date: TODAY,
      value: 8,
      targetSnapshot: 20,
    });
  });

  describe('backfill window', () => {
    it('allows today back to today − 6, never before the start date or in the future', async () => {
      const habit = await createHabit(client, core.id, { startDate: day(-6) });
      expect((await put(habit.id, day(-6), 20)).status).toBe(200);

      const tooOld = await put(habit.id, day(-7), 20);
      expect(tooOld.status).toBe(400);
      expect(tooOld.body).toMatchObject({
        code: 'BACKFILL_OUT_OF_RANGE',
        details: { earliest: day(-6), latest: TODAY },
      });
      expect((await put(habit.id, day(1), 20)).body.code).toBe('BACKFILL_OUT_OF_RANGE');

      const fresh = await createHabit(client, core.id, { name: 'New' });
      const beforeStart = await put(fresh.id, day(-1), 20);
      expect(beforeStart.body).toMatchObject({
        code: 'BACKFILL_OUT_OF_RANGE',
        details: { earliest: TODAY },
      });
    });

    it('rejects malformed dates', async () => {
      const habit = await createHabit(client, core.id);
      expect((await put(habit.id, 'yesterday', 1)).body.code).toBe('VALIDATION_FAILED');
      expect((await put(habit.id, '2026-02-30', 1)).status).toBe(400);
    });
  });

  it('snapshots the target in effect on the date, across an edit', async () => {
    const habit = await createHabit(client, core.id, { startDate: day(-6) });
    await client.patch(`/habits/${habit.id}`, { targetValue: 30 }); // effective today

    expect(result(await put(habit.id, day(-2), 25))).toMatchObject({
      log: { targetSnapshot: 20 },
      habitProgress: 1,
    });
    expect(result(await put(habit.id, TODAY, 25))).toMatchObject({
      log: { targetSnapshot: 30 },
      habitProgress: 25 / 30,
    });

    await client.patch(`/habits/${habit.id}`, { targetValue: 40 });
    const logs = (await client.get(`/habits/${habit.id}/logs?from=${day(-6)}&to=${TODAY}`)).body;
    expect(logs).toEqual([
      { date: day(-2), value: 25, targetSnapshot: 20 },
      { date: TODAY, value: 25, targetSnapshot: 30 },
    ]);
  });

  it('concurrent increments lose nothing', async () => {
    const habit = await createHabit(client, core.id);
    const results = await Promise.all(Array.from({ length: 20 }, () => inc(habit.id, TODAY, 1)));
    expect(results.every((res) => res.status === 200)).toBe(true);
    const log = await prisma.habitLog.findFirstOrThrow({ where: { habitId: habit.id } });
    expect(log.value).toBe(20);
    expect((await client.get(`/habits/${habit.id}`)).body).toMatchObject({
      currentStreak: 1,
      longestStreak: 1,
    });
  });

  it('keeps the stored longest streak up to date, also after a delete', async () => {
    const habit = await createHabit(client, core.id, { startDate: day(-6) });
    for (const offset of [-2, -1, 0]) {
      await put(habit.id, day(offset), 20);
    }
    expect((await client.get(`/habits/${habit.id}`)).body).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
    });

    const res = result(await client.delete(`/habits/${habit.id}/logs/${day(-1)}`));
    expect(res).toMatchObject({ log: null, currentStreak: 1, longestStreak: 1 });
    expect(result(await client.delete(`/habits/${habit.id}/logs/${day(-1)}`)).log).toBeNull();
  });

  it('refuses to log an archived habit', async () => {
    const habit = await createHabit(client, core.id);
    await client.post(`/habits/${habit.id}/archive`);
    const res = await put(habit.id, TODAY, 1);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('HABIT_ARCHIVED');
  });

  it('lists a range, by default the last 30 days', async () => {
    const habit = await createHabit(client, core.id, { startDate: day(-6) });
    await put(habit.id, day(-6), 20);
    await put(habit.id, TODAY, 5);
    const all = (await client.get(`/habits/${habit.id}/logs`)).body as { date: string }[];
    expect(all.map((log) => log.date)).toEqual([day(-6), TODAY]);
    const some = (await client.get(`/habits/${habit.id}/logs?from=${day(-1)}`)).body as {
      date: string;
    }[];
    expect(some.map((log) => log.date)).toEqual([TODAY]);
    expect((await client.get(`/habits/${habit.id}/logs?from=${TODAY}&to=${day(-1)}`)).status).toBe(
      400,
    );
  });
});

describe('logs where the local date is ahead of UTC (e2e)', () => {
  // 12:00 UTC on the 19th is 02:00 on the 20th in Kiritimati (UTC+14).
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now: '2026-11-19T12:00:00Z' });
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('uses the user’s local today', async () => {
    const { client } = await registerUser(app, 'kiri', { timezone: 'Pacific/Kiritimati' });
    const core = await createCore(client);
    const habit = await createHabit(client, core.id, { startDate: '2026-11-14' });
    expect(habit.startDate).toBe('2026-11-14');

    const put = (date: string) => client.put(`/habits/${habit.id}/logs/${date}`, { value: 20 });
    expect((await put('2026-11-20')).status).toBe(200);
    expect((await put('2026-11-14')).status).toBe(200);
    expect((await put('2026-11-21')).body.code).toBe('BACKFILL_OUT_OF_RANGE');
    expect((await client.get('/today')).body.date).toBe('2026-11-20');
  });
});
