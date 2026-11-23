import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  addDays,
  type ChangeLite,
  type CoreDto,
  daysToMask,
  type HabitDetailDto,
  type TargetChangeDto,
  targetOn,
  todayIn,
} from '@notch/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { registerUser, resetDb } from './helpers/auth.js';
import { createCore, createHabit } from './helpers/structure.js';
import type { TestClient } from './helpers/test-client.js';

const TZ = 'Asia/Baku'; // registerUser's timezone

describe('habits (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let client: TestClient;
  let core: CoreDto;
  let today: string;

  const history = async (id: string) =>
    (await client.get(`/habits/${id}/target-history`)).body as TargetChangeDto[];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
    ({ client } = await registerUser(app));
    core = await createCore(client);
    today = todayIn(TZ, new Date());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('create', () => {
    const SCHEDULES = [
      { scheduleType: 'DAILY' },
      { scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [1, 3, 5] },
      { scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 3 },
    ];
    const TYPES = [
      { type: 'TOGGLE', unit: undefined, targetValue: undefined },
      { type: 'COUNT', unit: 'pages', targetValue: 20 },
      { type: 'DURATION', unit: undefined, targetValue: 600 },
    ];
    const combos = TYPES.flatMap((type) => SCHEDULES.map((schedule) => ({ ...type, ...schedule })));

    it.each(combos)('creates $type × $scheduleType', async (combo) => {
      const habit = await createHabit(client, core.id, combo);
      const weeklyToggle = combo.type === 'TOGGLE' && combo.scheduleType === 'TIMES_PER_WEEK';
      const adaptive = combo.type !== 'TOGGLE' || weeklyToggle;
      expect(habit).toMatchObject({
        type: combo.type,
        scheduleType: combo.scheduleType,
        targetValue: combo.targetValue ?? 1,
        initialTargetValue: combo.targetValue ?? 1,
        daysOfWeek: combo.daysOfWeek ?? [],
        timesPerWeek: combo.timesPerWeek ?? null,
        initialTimesPerWeek: combo.timesPerWeek ?? null,
        intervalDays: combo.scheduleType === 'DAILY' ? 1 : null,
        adaptiveApplicable: adaptive,
        startDate: today,
        archivedAt: null,
        recentChanges: [],
      });
      // Default floor: half the initial value of the progressing field.
      const expectedMin = !adaptive ? null : weeklyToggle ? 2 : combo.type === 'COUNT' ? 10 : 300;
      expect(habit.minTarget).toBe(expectedMin);
    });

    it('keeps an explicit minTarget and the level settings', async () => {
      const habit = await createHabit(client, core.id, {
        minTarget: 15,
        maxTarget: 40,
        stepType: 'ABSOLUTE',
        stepValue: 5,
        timeOfDay: 'EVENING',
      });
      expect(habit).toMatchObject({
        minTarget: 15,
        maxTarget: 40,
        stepType: 'ABSOLUTE',
        stepValue: 5,
        timeOfDay: 'EVENING',
      });
    });

    it('allows a start date up to 6 days back, or in the future', async () => {
      expect(
        (await createHabit(client, core.id, { startDate: addDays(today, -6) })).startDate,
      ).toBe(addDays(today, -6));
      expect(
        (await createHabit(client, core.id, { startDate: addDays(today, 30) })).startDate,
      ).toBe(addDays(today, 30));

      const res = await client.post('/habits', {
        coreId: core.id,
        name: 'Too early',
        type: 'TOGGLE',
        scheduleType: 'DAILY',
        startDate: addDays(today, -7),
      });
      expect(res.status).toBe(400);
      expect(res.body.details.issues[0].path).toBe('startDate');
    });

    it('validates the shape', async () => {
      const res = await client.post('/habits', {
        coreId: core.id,
        name: 'X',
        type: 'TOGGLE',
        targetValue: 3,
        scheduleType: 'SPECIFIC_DAYS',
      });
      expect(res.status).toBe(400);
      const paths = res.body.details.issues.map((issue: { path: string }) => issue.path);
      expect(paths).toEqual(expect.arrayContaining(['targetValue', 'daysOfWeek']));
    });

    it('takes an interval for daily habits only, every 1 to 30 days', async () => {
      expect((await createHabit(client, core.id, { intervalDays: 3 })).intervalDays).toBe(3);

      const issuesOf = async (body: object) => {
        const res = await client.post('/habits', {
          coreId: core.id,
          name: 'X',
          type: 'TOGGLE',
          ...body,
        });
        expect(res.status, JSON.stringify(body)).toBe(400);
        return res.body.details.issues.map((issue: { path: string }) => issue.path);
      };
      expect(
        await issuesOf({ scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 3, intervalDays: 2 }),
      ).toContain('intervalDays');
      expect(
        await issuesOf({ scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [1], intervalDays: 1 }),
      ).toContain('intervalDays');
      expect(await issuesOf({ scheduleType: 'DAILY', intervalDays: 31 })).toContain('intervalDays');
      expect(await issuesOf({ scheduleType: 'DAILY', intervalDays: 0 })).toContain('intervalDays');
    });

    it('needs an owned, active core', async () => {
      const unknownCore = await client.post('/habits', {
        coreId: crypto.randomUUID(),
        name: 'X',
        type: 'TOGGLE',
        scheduleType: 'DAILY',
      });
      expect(unknownCore.body.code).toBe('CORE_NOT_FOUND');

      const other = await createCore(client, { name: 'Career' });
      await client.post(`/cores/${other.id}/archive`);
      const archived = await client.post('/habits', {
        coreId: other.id,
        name: 'X',
        type: 'TOGGLE',
        scheduleType: 'DAILY',
      });
      expect(archived.status).toBe(409);
      expect(archived.body.code).toBe('CORE_ARCHIVED');
    });
  });

  it('lists in order with filters', async () => {
    const other = await createCore(client, { name: 'Career' });
    await createHabit(client, core.id, { name: 'A' });
    await createHabit(client, other.id, { name: 'B' });
    const c = await createHabit(client, core.id, { name: 'C' });
    await client.post(`/habits/${c.id}/archive`);

    const names = async (query: string) =>
      ((await client.get(`/habits${query}`)).body as { name: string }[]).map((habit) => habit.name);
    expect(await names('')).toEqual(['A', 'B']);
    expect(await names(`?coreId=${core.id}`)).toEqual(['A']);
    expect(await names('?includeArchived=true')).toEqual(['A', 'B', 'C']);
  });

  describe('update', () => {
    it('edits plain fields without touching the history', async () => {
      const habit = await createHabit(client, core.id);
      const res = await client.patch(`/habits/${habit.id}`, {
        name: 'Read books',
        timeOfDay: 'MORNING',
        unit: 'chapters',
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: 'Read books',
        timeOfDay: 'MORNING',
        unit: 'chapters',
      });
      expect(await history(habit.id)).toEqual([]);
    });

    it('records a target edit as a MANUAL change effective today', async () => {
      const habit = await createHabit(client, core.id);
      const res = await client.patch(`/habits/${habit.id}`, { targetValue: 25 });
      expect(res.body.targetValue).toBe(25);
      expect(res.body.initialTargetValue).toBe(20);
      expect(res.body.recentChanges).toEqual([
        expect.objectContaining({
          kind: 'MANUAL',
          field: 'TARGET_VALUE',
          fromValue: 20,
          toValue: 25,
          effectiveFrom: today,
          undoneAt: null,
        }),
      ]);
    });

    it('folds several edits on one day into one change, and drops it when undone by hand', async () => {
      const habit = await createHabit(client, core.id);
      await client.patch(`/habits/${habit.id}`, { targetValue: 25 });
      await client.patch(`/habits/${habit.id}`, { targetValue: 30 });
      expect((await history(habit.id)).map((c) => [c.fromValue, c.toValue])).toEqual([[20, 30]]);

      await client.patch(`/habits/${habit.id}`, { targetValue: 20 });
      expect(await history(habit.id)).toEqual([]);
    });

    it('keeps a queryable history across days', async () => {
      const habit = await createHabit(client, core.id, { startDate: addDays(today, -6) });
      await client.patch(`/habits/${habit.id}`, { targetValue: 25 });
      // Pretend that edit happened three days ago.
      await prisma.targetChange.updateMany({
        where: { habitId: habit.id },
        data: {
          effectiveFrom: new Date(`${addDays(today, -3)}T00:00:00Z`),
          createdAt: new Date(Date.now() - 3 * 86_400_000),
        },
      });
      await client.patch(`/habits/${habit.id}`, { targetValue: 30 });

      const changes = await history(habit.id);
      expect(changes.map((c) => [c.effectiveFrom, c.fromValue, c.toValue])).toEqual([
        [addDays(today, -3), 20, 25],
        [today, 25, 30],
      ]);
      const lite: ChangeLite[] = changes.map((c) => ({
        ...c,
        undone: c.undoneAt !== null,
        createdAt: new Date(c.createdAt),
      }));
      expect(targetOn(addDays(today, -5), 30, lite)).toBe(20);
      expect(targetOn(addDays(today, -1), 30, lite)).toBe(25);
      expect(targetOn(today, 30, lite)).toBe(30);
    });

    it('records weekday and weekly-quota edits', async () => {
      const days = await createHabit(client, core.id, {
        scheduleType: 'SPECIFIC_DAYS',
        daysOfWeek: [1, 3, 5],
      });
      const res = await client.patch(`/habits/${days.id}`, { daysOfWeek: [2, 4] });
      expect(res.body.daysOfWeek).toEqual([2, 4]);
      expect(res.body.recentChanges[0]).toMatchObject({
        field: 'DAYS_OF_WEEK',
        fromValue: daysToMask([1, 3, 5]),
        toValue: daysToMask([2, 4]),
      });

      const weekly = await createHabit(client, core.id, {
        type: 'TOGGLE',
        unit: undefined,
        targetValue: undefined,
        scheduleType: 'TIMES_PER_WEEK',
        timesPerWeek: 3,
      });
      const quota = await client.patch(`/habits/${weekly.id}`, { timesPerWeek: 4 });
      expect(quota.body.recentChanges[0]).toMatchObject({
        field: 'TIMES_PER_WEEK',
        fromValue: 3,
        toValue: 4,
      });
    });

    it('records an interval edit like a weekday edit, and drops it when undone by hand', async () => {
      const habit = await createHabit(client, core.id);
      const res = await client.patch(`/habits/${habit.id}`, { intervalDays: 2 });
      expect(res.status).toBe(200);
      expect(res.body.intervalDays).toBe(2);
      expect(res.body.recentChanges).toEqual([
        expect.objectContaining({
          kind: 'MANUAL',
          field: 'INTERVAL_DAYS',
          fromValue: 1,
          toValue: 2,
          effectiveFrom: today,
          undoDeadline: null,
        }),
      ]);
      // Unchanged: nothing new is recorded.
      await client.patch(`/habits/${habit.id}`, { intervalDays: 2, name: 'Renamed' });
      expect(await history(habit.id)).toHaveLength(1);

      await client.patch(`/habits/${habit.id}`, { intervalDays: 1 });
      expect(await history(habit.id)).toEqual([]);

      const days = await createHabit(client, core.id, {
        scheduleType: 'SPECIFIC_DAYS',
        daysOfWeek: [1, 3, 5],
      });
      const refused = await client.patch(`/habits/${days.id}`, { intervalDays: 2 });
      expect(refused.status).toBe(400);
      expect(refused.body.details.issues[0].path).toBe('intervalDays');
    });

    it('refuses to change the type, schedule type or start date', async () => {
      const habit = await createHabit(client, core.id);
      for (const body of [
        { type: 'DURATION' },
        { scheduleType: 'TIMES_PER_WEEK' },
        { startDate: today },
      ]) {
        const res = await client.patch(`/habits/${habit.id}`, body);
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
    });

    it('checks the merged habit, not just the patch', async () => {
      const daily = await createHabit(client, core.id, { minTarget: 15 });
      const cases: [object, string][] = [
        [{ daysOfWeek: [1] }, 'daysOfWeek'],
        [{ timesPerWeek: 3 }, 'timesPerWeek'],
        [{ targetValue: 10 }, 'minTarget'],
        [{ maxTarget: 10 }, 'maxTarget'],
      ];
      for (const [body, path] of cases) {
        const res = await client.patch(`/habits/${daily.id}`, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body.details.issues.map((issue: { path: string }) => issue.path)).toContain(
          path,
        );
      }
      const toggle = await createHabit(client, core.id, {
        type: 'TOGGLE',
        unit: undefined,
        targetValue: undefined,
      });
      expect((await client.patch(`/habits/${toggle.id}`, { targetValue: 2 })).status).toBe(400);
      expect(await history(daily.id)).toEqual([]);
    });

    it('moves between cores', async () => {
      const habit = await createHabit(client, core.id);
      const other = await createCore(client, { name: 'Career' });

      const moved = await client.patch(`/habits/${habit.id}`, { coreId: other.id });
      expect(moved.status).toBe(200);
      expect(moved.body.coreId).toBe(other.id);
      expect((await client.get('/cores')).body.map((row: CoreDto) => row.counts.habits)).toEqual([
        0, 1,
      ]);
    });

    it('can still edit a habit in an archived core, but not move one into it', async () => {
      const habit = await createHabit(client, core.id);
      const other = await createCore(client, { name: 'Career' });
      await client.post(`/cores/${other.id}/archive`);
      expect((await client.patch(`/habits/${habit.id}`, { coreId: other.id })).body.code).toBe(
        'CORE_ARCHIVED',
      );

      await client.post(`/cores/${core.id}/archive`);
      expect((await client.patch(`/habits/${habit.id}`, { name: 'Renamed' })).status).toBe(200);
    });
  });

  it('reorders', async () => {
    const ids: string[] = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push((await createHabit(client, core.id, { name })).id);
    }
    const res = await client.put('/habits/order', { ids: [ids[2], ids[0]] });
    expect(res.body.map((habit: { name: string }) => habit.name)).toEqual(['C', 'A', 'B']);
    expect((await client.put('/habits/order', { ids: [crypto.randomUUID()] })).body.code).toBe(
      'HABIT_NOT_FOUND',
    );
  });

  describe('archive', () => {
    it('archives and unarchives', async () => {
      const habit = await createHabit(client, core.id);
      expect((await client.post(`/habits/${habit.id}/archive`)).body.archivedAt).toEqual(
        expect.any(String),
      );
      expect((await client.post(`/habits/${habit.id}/unarchive`)).body.archivedAt).toBeNull();
    });

    it('archiving a core archives its habits; unarchiving a habit there is refused', async () => {
      const habit = await createHabit(client, core.id);
      const archivedCore = await client.post(`/cores/${core.id}/archive`);
      const archivedHabit = (await client.get(`/habits/${habit.id}`)).body as HabitDetailDto;
      expect(archivedHabit.archivedAt).toBe(archivedCore.body.archivedAt);

      const res = await client.post(`/habits/${habit.id}/unarchive`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CORE_ARCHIVED');
    });
  });

  describe('with cores', () => {
    it('counts active habits per core, and blocks deleting a core with any habit', async () => {
      const habit = await createHabit(client, core.id);
      await createHabit(client, core.id);
      expect((await client.get('/cores')).body[0].counts).toEqual({ habits: 2 });

      await client.post(`/habits/${habit.id}/archive`);
      expect((await client.get('/cores')).body[0].counts.habits).toBe(1);

      await prisma.habit.deleteMany({ where: { id: { not: habit.id } } });
      const res = await client.delete(`/cores/${core.id}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CORE_NOT_EMPTY');
    });
  });

  it('delete removes the habit and its history', async () => {
    const habit = await createHabit(client, core.id);
    await client.patch(`/habits/${habit.id}`, { targetValue: 30 });
    expect((await client.delete(`/habits/${habit.id}`)).status).toBe(204);
    expect((await client.get(`/habits/${habit.id}`)).status).toBe(404);
    expect(await prisma.targetChange.count()).toBe(0);
  });
});
