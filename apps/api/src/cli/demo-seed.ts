import type { INestApplicationContext } from '@nestjs/common';
import {
  adaptiveApplicable,
  addDays,
  daysToMask,
  defaultMinTarget,
  fromDateString,
  isoWeekday,
  isScheduledOn,
  type LocalDate,
  longestStreak,
  scheduleOn,
  targetOn,
  weekRange,
  weekStartOf,
} from '@notch/shared';
import type { HabitType, ScheduleType, TimeOfDay } from '../generated/prisma/client.js';
import { historyOf, scheduleOf, toChangeLite } from '../habits/habit-history.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';

export const DEMO_USERNAME = 'demo';
export const DEMO_PASSWORD = 'demo-password';

interface DayContext {
  today: LocalDate;
  due: boolean;
  /** The target in effect on the day, after any level-up or deload. */
  target: number;
}

interface DemoHabit {
  name: string;
  core: 'Health' | 'Mind' | 'Career';
  type: HabitType;
  unit?: string;
  /** The starting target. Adaptive habits move from here as the reviews run. */
  target: number;
  scheduleType: ScheduleType;
  daysOfWeek?: number[];
  timesPerWeek?: number;
  timeOfDay: TimeOfDay;
  linkGoal?: boolean;
  adaptiveEnabled?: boolean;
  maxTarget?: number;
  /** A manual edit partway through: before `from` the old value applied. */
  edit?: { field: 'TARGET_VALUE' | 'DAYS_OF_WEEK'; from: LocalDate; oldValue: number };
  /** The day's logged value, or undefined for no log. */
  value: (date: LocalDate, ctx: DayContext) => number | undefined;
}

/**
 * The demo account's habits and what was logged each day, relative to `today`. Every type and
 * schedule appears, one target edit and one weekday edit happen partway through, and the weekly
 * reviews produce real changes: Meditate levels up twice (480 → 540 → 600 s, its max), Deep work
 * levels up twice (3000 → 3300 → 3600 s, its max) and deloads back to 3300 after a weak last week.
 */
function demoHabits(today: LocalDate): DemoHabit[] {
  const week = weekStartOf(today);
  const thisWeek = (date: LocalDate) => date >= week;
  const hitIfDue = (_date: LocalDate, { due, target }: DayContext) => (due ? target : undefined);

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
      adaptiveEnabled: false,
      edit: { field: 'TARGET_VALUE', from: addDays(week, -14), oldValue: 20 },
      // 10 pages yesterday (a miss), nothing yet today.
      value: (date, ctx) =>
        date === ctx.today ? undefined : date === addDays(ctx.today, -1) ? 10 : hitIfDue(date, ctx),
    },
    {
      name: 'Meditate',
      core: 'Mind',
      type: 'DURATION',
      target: 480,
      maxTarget: 600,
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
      maxTarget: 3,
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
      maxTarget: 30,
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
      target: 3000,
      maxTarget: 3600,
      scheduleType: 'TIMES_PER_WEEK',
      timesPerWeek: 4,
      timeOfDay: 'AFTERNOON',
      // Mon–Thu each week, but only Monday last week; this week Mon–Wed, and half an hour today.
      value: (date, ctx) => {
        if (date === ctx.today) {
          return 1800;
        }
        const days = thisWeek(date) ? [1, 2, 3] : date >= addDays(week, -7) ? [1] : [1, 2, 3, 4];
        return days.includes(isoWeekday(date)) ? ctx.target : undefined;
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

export interface SeedDemoOptions {
  /** Defaults to `demo`. Playwright seeds a user of its own per spec. */
  username?: string;
  today: LocalDate;
  timezone: string;
  passwordHash: string;
  /**
   * Stop at the end of last week, before its review: the state on a Monday before the first
   * visit. Otherwise the history runs through `today`.
   */
  pendingMonday?: boolean;
}

/**
 * Creates the demo user (replacing an existing one) with 8 weeks of history. The history is
 * simulated week by week, running the real weekly review every Monday, so its reviews, level-ups
 * and deloads are exactly what the app would have produced. Deterministic for a given `today`.
 */
export async function seedDemo(
  app: INestApplicationContext,
  {
    username = DEMO_USERNAME,
    today,
    timezone,
    passwordHash,
    pendingMonday = false,
  }: SeedDemoOptions,
): Promise<{ userId: string; habitIds: Record<string, string> }> {
  const prisma = app.get(PrismaService);
  const reviews = app.get(ReviewsService);
  const specs = demoHabits(today);
  const start = addDays(weekStartOf(today), -56);
  const lastDay = pendingMonday ? addDays(weekStartOf(today), -1) : today;

  const { userId, habitIds } = await createAccount(prisma, specs, {
    username,
    start,
    today,
    timezone,
    passwordHash,
  });
  const specByHabitId = new Map(specs.map((spec) => [habitIds[spec.name]!, spec]));

  for (let monday = start; monday <= lastDay; monday = addDays(monday, 7)) {
    if (monday > start) {
      await reviews.runForUser(userId, addDays(monday, -7));
    }
    const habits = await prisma.habit.findMany({
      where: { userId },
      include: { targetChanges: true },
    });
    const logs = [];
    for (const date of weekRange(monday).filter((day) => day <= lastDay)) {
      for (const habit of habits) {
        const changes = habit.targetChanges.map(toChangeLite);
        const target = targetOn(date, habit.targetValue, changes);
        const due = isScheduledOn(scheduleOn(date, scheduleOf(habit), changes), date);
        const value = specByHabitId.get(habit.id)!.value(date, { today, due, target });
        if (value !== undefined && value > 0) {
          logs.push({
            habitId: habit.id,
            userId,
            date: fromDateString(date),
            value,
            targetSnapshot: target,
          });
        }
      }
    }
    await prisma.habitLog.createMany({ data: logs });
  }

  const habits = await prisma.habit.findMany({
    where: { userId },
    include: { targetChanges: true, logs: true },
  });
  for (const habit of habits) {
    await prisma.habit.update({
      where: { id: habit.id },
      data: {
        longestStreak: longestStreak(historyOf(habit, habit.targetChanges, habit.logs), lastDay),
      },
    });
  }
  const latest = await prisma.weeklyReview.findFirst({
    where: { userId },
    orderBy: { weekStart: 'desc' },
  });
  await prisma.weeklyReview.updateMany({
    where: { userId, ...(latest && { id: { not: latest.id } }) },
    data: { seenAt: new Date() },
  });
  return { userId, habitIds };
}

async function createAccount(
  prisma: PrismaService,
  specs: DemoHabit[],
  ctx: {
    username: string;
    start: LocalDate;
    today: LocalDate;
    timezone: string;
    passwordHash: string;
  },
): Promise<{ userId: string; habitIds: Record<string, string> }> {
  return prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { username: ctx.username } });
    const user = await tx.user.create({
      data: {
        username: ctx.username,
        passwordHash: ctx.passwordHash,
        name: 'Demo',
        timezone: ctx.timezone,
        onboardedAt: fromDateString(ctx.start),
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
        deadline: fromDateString(addDays(ctx.today, 120)),
        milestones: {
          create: ['5 km', '10 km', '15 km', 'Half marathon'].map((title, sortOrder) => ({
            title,
            sortOrder,
            completedAt:
              sortOrder < 2 ? fromDateString(addDays(ctx.today, sortOrder * 14 - 30)) : null,
          })),
        },
      },
    });

    const habitIds: Record<string, string> = {};
    for (const [sortOrder, spec] of specs.entries()) {
      const shape = { type: spec.type, scheduleType: spec.scheduleType };
      const settings = {
        ...shape,
        stepType: 'PERCENT' as const,
        stepValue: 10,
        minTarget: null,
        maxTarget: null,
      };
      const initial =
        spec.scheduleType === 'TIMES_PER_WEEK' && spec.type === 'TOGGLE'
          ? spec.timesPerWeek!
          : spec.target;
      const habit = await tx.habit.create({
        data: {
          userId: user.id,
          coreId: cores.get(spec.core)!,
          goalId: spec.linkGoal ? goal.id : null,
          name: spec.name,
          type: spec.type,
          unit: spec.unit ?? null,
          targetValue: spec.target,
          initialTargetValue:
            spec.edit?.field === 'TARGET_VALUE' ? spec.edit.oldValue : spec.target,
          scheduleType: spec.scheduleType,
          daysOfWeek: spec.daysOfWeek ?? [],
          timesPerWeek: spec.timesPerWeek ?? null,
          initialTimesPerWeek: spec.timesPerWeek ?? null,
          timeOfDay: spec.timeOfDay,
          adaptiveEnabled: spec.adaptiveEnabled ?? true,
          minTarget: adaptiveApplicable(shape) ? defaultMinTarget(settings, initial) : null,
          maxTarget: spec.maxTarget ?? null,
          startDate: fromDateString(ctx.start),
          sortOrder,
        },
      });
      if (spec.edit) {
        await tx.targetChange.create({
          data: {
            habitId: habit.id,
            kind: 'MANUAL',
            field: spec.edit.field,
            fromValue: spec.edit.oldValue,
            toValue:
              spec.edit.field === 'TARGET_VALUE' ? spec.target : daysToMask(spec.daysOfWeek ?? []),
            effectiveFrom: fromDateString(spec.edit.from),
            createdAt: fromDateString(spec.edit.from),
          },
        });
      }
      habitIds[spec.name] = habit.id;
    }
    return { userId: user.id, habitIds };
  });
}
