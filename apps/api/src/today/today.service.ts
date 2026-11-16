import { Injectable } from '@nestjs/common';
import {
  computeProgress,
  type CoreColor,
  currentStreak,
  fromDateString,
  isScheduledOn,
  scheduleOn,
  targetOn,
  TIMES_OF_DAY,
  type TimeOfDay,
  type TodayHabit,
  type TodayResponse,
  todayIn,
  weekStartOf,
  weekStats,
} from '@notch/shared';
import type { AuthUser } from '../auth/request-auth.js';
import { Clock } from '../clock/clock.js';
import type { HabitLog, TargetChange } from '../generated/prisma/client.js';
import { historyOf } from '../habits/habit-history.js';
import { assertInWindow } from '../logs/logs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(key(row));
    if (list) {
      list.push(row);
    } else {
      groups.set(key(row), [row]);
    }
  }
  return groups;
}

/**
 * The Today screen for one date (today or up to 6 days back). Three queries (habits, their logs,
 * their target changes), then everything is computed in memory as of that date.
 */
@Injectable()
export class TodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async forDate(user: AuthUser, requested?: string): Promise<TodayResponse> {
    const today = todayIn(user.timezone, this.clock.now());
    const date = requested ?? today;
    assertInWindow(null, date, today);

    const habits = await this.prisma.habit.findMany({
      where: { userId: user.id, archivedAt: null, startDate: { lte: fromDateString(date) } },
      include: {
        core: { select: { id: true, name: true, color: true, icon: true } },
        goal: { select: { id: true, title: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const habitIds = habits.map((habit) => habit.id);
    const [logs, changes] = await Promise.all([
      this.prisma.habitLog.findMany({
        where: { habitId: { in: habitIds }, date: { lte: fromDateString(date) } },
      }),
      this.prisma.targetChange.findMany({ where: { habitId: { in: habitIds } } }),
    ]);
    const logsByHabit = groupBy<HabitLog>(logs, (log) => log.habitId);
    const changesByHabit = groupBy<TargetChange>(changes, (change) => change.habitId);

    const byTimeOfDay = new Map<TimeOfDay, TodayHabit[]>();
    const weeklyQuota: TodayHabit[] = [];

    for (const habit of habits) {
      const habitChanges = changesByHabit.get(habit.id) ?? [];
      const history = historyOf(habit, habitChanges, logsByHabit.get(habit.id) ?? []);
      const log = history.logs.get(date);
      const item: TodayHabit = {
        id: habit.id,
        name: habit.name,
        type: habit.type,
        unit: habit.unit,
        scheduleType: habit.scheduleType,
        timeOfDay: habit.timeOfDay,
        core: { ...habit.core, color: habit.core.color as CoreColor },
        goal: habit.goal,
        target: targetOn(date, habit.targetValue, history.changes),
        log: log ? { value: log.value, targetSnapshot: log.targetSnapshot } : null,
        progress: log ? computeProgress(log.value, log.targetSnapshot) : 0,
        currentStreak: currentStreak(history, date),
      };

      if (habit.scheduleType === 'TIMES_PER_WEEK') {
        const stats = weekStats(history, weekStartOf(date), date);
        weeklyQuota.push({ ...item, week: { hits: stats.hits, quota: stats.occurrences } });
      } else if (isScheduledOn(scheduleOn(date, history.schedule, history.changes), date)) {
        const group = byTimeOfDay.get(habit.timeOfDay) ?? [];
        group.push(item);
        byTimeOfDay.set(habit.timeOfDay, group);
      }
    }

    const groups = TIMES_OF_DAY.filter((timeOfDay) => byTimeOfDay.has(timeOfDay)).map(
      (timeOfDay) => ({ timeOfDay, habits: byTimeOfDay.get(timeOfDay)! }),
    );
    const due = groups.flatMap((group) => group.habits);
    return {
      date,
      dayProgress:
        due.length === 0 ? null : due.reduce((sum, habit) => sum + habit.progress, 0) / due.length,
      // S5: the unseen weekly review and the "welcome back" flag.
      pendingReview: null,
      welcomeBack: false,
      groups,
      weeklyQuota,
    };
  }
}
