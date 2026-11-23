import { Injectable } from '@nestjs/common';
import {
  averageRate,
  buildHeatmap,
  type CoreColor,
  currentStreak,
  dailySeries,
  type DateWindow,
  fromDateString,
  habitWindow,
  type HabitStatsDto,
  progressingField,
  rangeDates,
  rangeStats,
  type StatsOverviewDto,
  type StatsRange,
  targetSeries,
  todayIn,
  toDateString,
} from '@notch/shared';
import type { AuthUser } from '../auth/request-auth.js';
import { Clock } from '../clock/clock.js';
import { habitNotFound } from '../common/not-found.js';
import type { Habit, HabitLog, TargetChange } from '../generated/prisma/client.js';
import { historyOf } from '../habits/habit-history.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Statistics over the last 7/30/90/365 days, computed on request from the full history, with the
 * same rules as streaks and reviews (plan 2.5, 6.3). Read-only: no review is triggered.
 */
@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async overview(user: AuthUser, range: StatsRange): Promise<StatsOverviewDto> {
    const today = todayIn(user.timezone, this.clock.now());
    const dates = rangeDates(range, today);

    const habits = await this.prisma.habit.findMany({
      where: { userId: user.id, startDate: { lte: fromDateString(dates.to) } },
      include: { core: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const habitIds = habits.map((habit) => habit.id);
    const [logs, changes] = await Promise.all([
      this.prisma.habitLog.findMany({
        where: { habitId: { in: habitIds }, date: { lte: fromDateString(dates.to) } },
      }),
      this.prisma.targetChange.findMany({ where: { habitId: { in: habitIds } } }),
    ]);

    const counted = habits.flatMap((habit) => {
      const history = historyOf(habit, changesOf(changes, habit), logsOf(logs, habit));
      const window = habitWindow(
        { startDate: toDateString(habit.startDate), archiveDate: this.archiveDate(habit, user) },
        dates,
      );
      return window ? [{ habit, history, window, ...rangeStats(history, window) }] : [];
    });

    // Every core with a habit in the range, archived ones included, in core order.
    const ratesByCore = new Map<string, (number | null)[]>();
    for (const item of counted) {
      ratesByCore.set(item.habit.coreId, [
        ...(ratesByCore.get(item.habit.coreId) ?? []),
        item.rate,
      ]);
    }
    const coreRows = [
      ...new Map(counted.map((item) => [item.habit.core.id, item.habit.core])).values(),
    ]
      .toSorted(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
      )
      .map((core) => ({
        coreId: core.id,
        name: core.name,
        color: core.color as CoreColor,
        icon: core.icon,
        rate: averageRate(ratesByCore.get(core.id)!),
      }));

    const topStreaks = habits
      .filter((habit) => habit.archivedAt === null)
      .map((habit) => ({
        habitId: habit.id,
        name: habit.name,
        currentStreak: currentStreak(
          historyOf(habit, changesOf(changes, habit), logsOf(logs, habit)),
          today,
        ),
      }))
      .filter((habit) => habit.currentStreak > 0)
      .toSorted((a, b) => b.currentStreak - a.currentStreak || a.name.localeCompare(b.name))
      .slice(0, 5);

    const automatic = changes.filter(
      (change) =>
        change.undoneAt === null &&
        toDateString(change.effectiveFrom) >= dates.from &&
        toDateString(change.effectiveFrom) <= dates.to,
    );

    return {
      range,
      ...dates,
      overallRate: averageRate(counted.map((item) => item.rate)),
      daily: dailySeries(counted, dates),
      cores: coreRows,
      topStreaks,
      changes: {
        levelUps: automatic.filter((change) => change.kind === 'LEVEL_UP').length,
        deloads: automatic.filter((change) => change.kind === 'DELOAD').length,
      },
    };
  }

  /** One habit, archived ones included (their history stays). */
  async habit(user: AuthUser, id: string, range: StatsRange): Promise<HabitStatsDto> {
    const habit = await this.prisma.habit.findFirst({
      where: { id, userId: user.id },
      include: { logs: true, targetChanges: true },
    });
    if (!habit) {
      throw habitNotFound();
    }
    const today = todayIn(user.timezone, this.clock.now());
    const dates = rangeDates(range, today);
    const history = historyOf(habit, habit.targetChanges, habit.logs);
    const field = progressingField(habit) ?? 'TARGET_VALUE';
    const current = field === 'TIMES_PER_WEEK' ? (habit.timesPerWeek ?? 0) : habit.targetValue;
    const window: DateWindow | null = habitWindow(
      { startDate: toDateString(habit.startDate), archiveDate: this.archiveDate(habit, user) },
      dates,
    );
    const inWindow = (date: string) => window !== null && date >= window.from && date <= window.to;

    return {
      habitId: habit.id,
      range,
      ...(window ?? dates),
      ...(window ? rangeStats(history, window) : { hits: 0, occurrences: 0, rate: null }),
      currentStreak: habit.archivedAt ? 0 : currentStreak(history, today),
      longestStreak: habit.longestStreak,
      totalValue: [...history.logs.values()]
        .filter((log) => inWindow(log.date))
        .reduce((sum, log) => sum + log.value, 0),
      heatmap: window ? buildHeatmap(history, window, habit.targetValue) : [],
      field,
      targetSeries: window ? targetSeries(field, current, history.changes, window) : [],
    };
  }

  private archiveDate(habit: Habit, user: AuthUser): string | null {
    return habit.archivedAt ? todayIn(user.timezone, habit.archivedAt) : null;
  }
}

const changesOf = (changes: TargetChange[], habit: Habit) =>
  changes.filter((change) => change.habitId === habit.id);
const logsOf = (logs: HabitLog[], habit: Habit) => logs.filter((log) => log.habitId === habit.id);
