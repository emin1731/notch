import {
  addDays,
  daysToMask,
  fromDateString,
  habitHistory,
  isoWeekday,
  isScheduledOn,
  type LocalDate,
  longestStreak,
  scheduleOn,
  type ScheduleSnapshot,
  weekStartOf,
} from '@notch/shared';
import type { HabitType, Prisma, ScheduleType, TimeOfDay } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export const DEMO_USERNAME = 'demo';
export const DEMO_PASSWORD = 'demo-password';

interface DemoHabit {
  name: string;
  core: 'Health' | 'Mind' | 'Career';
  type: HabitType;
  unit?: string;
  target: number;
  scheduleType: ScheduleType;
  daysOfWeek?: number[];
  timesPerWeek?: number;
  timeOfDay: TimeOfDay;
  linkGoal?: boolean;
  /** A manual edit partway through the history: before `from` the old value applied. */
  edit?: { field: 'TARGET_VALUE' | 'DAYS_OF_WEEK'; from: LocalDate; oldValue: number };
  /** The day's value, or undefined for no log. Called for every day from the start to today. */
  value: (
    date: LocalDate,
    ctx: { today: LocalDate; due: boolean; target: number },
  ) => number | undefined;
}

/**
 * The demo account: 8 weeks of history, deterministic for a given `today`, so the Today e2e test
 * can check exact numbers. Every type and schedule appears, with one target edit and one weekday
 * edit partway through.
 */
function demoHabits(today: LocalDate): DemoHabit[] {
  const week = weekStartOf(today);
  const thisWeek = (date: LocalDate) => date >= week;
  const hitIfDue = (date: LocalDate, { due, target }: { due: boolean; target: number }) =>
    due ? target : undefined;

  return [
    {
      name: 'Cold shower',
      core: 'Health',
      type: 'TOGGLE',
      target: 1,
      scheduleType: 'DAILY',
      timeOfDay: 'MORNING',
      // Missed 5 days ago.
      value: (date, ctx) => (date === addDays(ctx.today, -5) ? undefined : hitIfDue(date, ctx)),
    },
    {
      name: 'Read',
      core: 'Mind',
      type: 'COUNT',
      unit: 'pages',
      target: 25,
      scheduleType: 'DAILY',
      timeOfDay: 'EVENING',
      edit: { field: 'TARGET_VALUE', from: addDays(week, -14), oldValue: 20 },
      // 10 pages yesterday (a miss), nothing yet today.
      value: (date, ctx) =>
        date === ctx.today ? undefined : date === addDays(ctx.today, -1) ? 10 : hitIfDue(date, ctx),
    },
    {
      name: 'Meditate',
      core: 'Mind',
      type: 'DURATION',
      target: 600,
      scheduleType: 'DAILY',
      timeOfDay: 'MORNING',
      // Half done today.
      value: (date, ctx) => (date === ctx.today ? 300 : hitIfDue(date, ctx)),
    },
    {
      name: 'Gym',
      core: 'Health',
      type: 'TOGGLE',
      target: 1,
      scheduleType: 'TIMES_PER_WEEK',
      timesPerWeek: 3,
      timeOfDay: 'ANYTIME',
      linkGoal: true,
      // Mon/Wed/Fri in past weeks; Mon/Tue so far this week.
      value: (date) =>
        (thisWeek(date) ? [1, 2] : [1, 3, 5]).includes(isoWeekday(date)) ? 1 : undefined,
    },
    {
      name: 'Strength',
      core: 'Health',
      type: 'COUNT',
      unit: 'reps',
      target: 30,
      scheduleType: 'SPECIFIC_DAYS',
      daysOfWeek: [1, 3, 5],
      timeOfDay: 'ANYTIME',
      // Tue/Thu until 3 weeks ago, Mon/Wed/Fri since. Never missed.
      edit: { field: 'DAYS_OF_WEEK', from: addDays(week, -21), oldValue: daysToMask([2, 4]) },
      value: (date, ctx) => (date === ctx.today ? undefined : hitIfDue(date, ctx)),
    },
    {
      name: 'Deep work',
      core: 'Career',
      type: 'DURATION',
      target: 3600,
      scheduleType: 'TIMES_PER_WEEK',
      timesPerWeek: 4,
      timeOfDay: 'AFTERNOON',
      // Mon–Thu each week, but only Mon/Tue last week; this week Mon–Wed, and half an hour today.
      value: (date, ctx) => {
        if (date === ctx.today) {
          return 1800;
        }
        const days = thisWeek(date) ? [1, 2, 3] : date >= addDays(week, -7) ? [1, 2] : [1, 2, 3, 4];
        return days.includes(isoWeekday(date)) ? 3600 : undefined;
      },
    },
    {
      name: 'Journal',
      core: 'Mind',
      type: 'TOGGLE',
      target: 1,
      scheduleType: 'SPECIFIC_DAYS',
      daysOfWeek: [6, 7],
      timeOfDay: 'EVENING',
      value: (date, ctx) => (date === ctx.today ? undefined : hitIfDue(date, ctx)),
    },
  ];
}

/** Creates the demo user and its data. Replaces an existing demo user. */
export async function seedDemo(
  prisma: PrismaService,
  { today, timezone, passwordHash }: { today: LocalDate; timezone: string; passwordHash: string },
): Promise<{ userId: string; habitIds: Record<string, string> }> {
  const startDate = addDays(weekStartOf(today), -56);
  return prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { username: DEMO_USERNAME } });
    const user = await tx.user.create({
      data: {
        username: DEMO_USERNAME,
        passwordHash,
        name: 'Demo',
        timezone,
        onboardedAt: fromDateString(startDate),
      },
    });

    const cores = new Map<string, string>();
    for (const [sortOrder, [name, color, icon]] of [
      ['Health', 'emerald', 'heart-pulse'],
      ['Mind', 'violet', 'brain'],
      ['Career', 'indigo', 'briefcase'],
    ].entries()) {
      const core = await tx.core.create({
        data: { userId: user.id, name: name!, color: color!, icon: icon!, sortOrder },
      });
      cores.set(name!, core.id);
    }
    const goal = await tx.goal.create({
      data: {
        userId: user.id,
        coreId: cores.get('Health')!,
        title: 'Run a half marathon',
        deadline: fromDateString(addDays(today, 120)),
        milestones: {
          create: ['5 km', '10 km', '15 km', 'Half marathon'].map((title, sortOrder) => ({
            title,
            sortOrder,
            completedAt: sortOrder < 2 ? fromDateString(addDays(today, sortOrder * 14 - 30)) : null,
          })),
        },
      },
    });

    const habitIds: Record<string, string> = {};
    for (const [sortOrder, spec] of demoHabits(today).entries()) {
      habitIds[spec.name] = await seedHabit(tx, spec, {
        userId: user.id,
        coreId: cores.get(spec.core)!,
        goalId: spec.linkGoal ? goal.id : null,
        sortOrder,
        startDate,
        today,
      });
    }
    return { userId: user.id, habitIds };
  });
}

async function seedHabit(
  tx: Prisma.TransactionClient,
  spec: DemoHabit,
  ctx: {
    userId: string;
    coreId: string;
    goalId: string | null;
    sortOrder: number;
    startDate: LocalDate;
    today: LocalDate;
  },
): Promise<string> {
  const daysOfWeek = spec.daysOfWeek ?? [];
  const initialTarget = spec.edit?.field === 'TARGET_VALUE' ? spec.edit.oldValue : spec.target;
  const habit = await tx.habit.create({
    data: {
      userId: ctx.userId,
      coreId: ctx.coreId,
      goalId: ctx.goalId,
      name: spec.name,
      type: spec.type,
      unit: spec.unit ?? null,
      targetValue: spec.target,
      initialTargetValue: initialTarget,
      scheduleType: spec.scheduleType,
      daysOfWeek,
      timesPerWeek: spec.timesPerWeek ?? null,
      initialTimesPerWeek: spec.timesPerWeek ?? null,
      timeOfDay: spec.timeOfDay,
      minTarget: spec.type === 'TOGGLE' && spec.scheduleType !== 'TIMES_PER_WEEK' ? null : 1,
      startDate: fromDateString(ctx.startDate),
      sortOrder: ctx.sortOrder,
    },
  });

  const changes = [];
  if (spec.edit) {
    const toValue = spec.edit.field === 'TARGET_VALUE' ? spec.target : daysToMask(daysOfWeek);
    const change = {
      field: spec.edit.field,
      fromValue: spec.edit.oldValue,
      toValue,
      effectiveFrom: spec.edit.from,
      undone: false,
      createdAt: fromDateString(spec.edit.from),
    };
    changes.push(change);
    await tx.targetChange.create({
      data: {
        habitId: habit.id,
        kind: 'MANUAL',
        field: change.field,
        fromValue: change.fromValue,
        toValue: change.toValue,
        effectiveFrom: fromDateString(change.effectiveFrom),
        createdAt: change.createdAt,
      },
    });
  }

  const schedule: ScheduleSnapshot = {
    scheduleType: spec.scheduleType,
    daysOfWeek,
    timesPerWeek: spec.timesPerWeek ?? null,
    startDate: ctx.startDate,
  };
  const logs = [];
  for (let date = ctx.startDate; date <= ctx.today; date = addDays(date, 1)) {
    const target =
      spec.edit?.field === 'TARGET_VALUE' && date < spec.edit.from
        ? spec.edit.oldValue
        : spec.target;
    const due = isScheduledOn(scheduleOn(date, schedule, changes), date);
    const value = spec.value(date, { today: ctx.today, due, target });
    if (value !== undefined && value > 0) {
      logs.push({ date, value, targetSnapshot: target });
    }
  }
  await tx.habitLog.createMany({
    data: logs.map((log) => ({
      habitId: habit.id,
      userId: ctx.userId,
      date: fromDateString(log.date),
      value: log.value,
      targetSnapshot: log.targetSnapshot,
    })),
  });
  await tx.habit.update({
    where: { id: habit.id },
    data: { longestStreak: longestStreak(habitHistory(schedule, changes, logs), ctx.today) },
  });
  return habit.id;
}
