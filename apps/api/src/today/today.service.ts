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
  toDateString,
  undoBlockReason,
  weekStartOf,
  weekStats,
} from '@notch/shared';
import type { AuthUser } from '../auth/request-auth.js';
import { Clock } from '../clock/clock.js';
import type { Habit, HabitLog, TargetChange } from '../generated/prisma/client.js';
import { historyOf } from '../habits/habit-history.js';
import { assertInWindow } from '../logs/logs.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentValueOf } from '../reviews/review-dto.js';
import { ReviewsService } from '../reviews/reviews.service.js';

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
    private readonly reviews: ReviewsService,
  ) {}

  async forDate(user: AuthUser, requested?: string): Promise<TodayResponse> {
    const now = this.clock.now();
    const today = todayIn(user.timezone, now);
    const date = requested ?? today;
    assertInWindow(null, date, today);
    await this.reviews.ensureDue(user);

    const habits = await this.prisma.habit.findMany({
      where: { userId: user.id, archivedAt: null, startDate: { lte: fromDateString(date) } },
      include: {
        core: { select: { id: true, name: true, color: true, icon: true } },
        goal: { select: { id: true, title: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const habitIds = habits.map((habit) => habit.id);
    const [logs, changes, latestReview] = await Promise.all([
      // Up to today, not just `date`: whether a change can still be undone depends on later logs.
      this.prisma.habitLog.findMany({
        where: { habitId: { in: habitIds }, date: { lte: fromDateString(today) } },
      }),
      this.prisma.targetChange.findMany({ where: { habitId: { in: habitIds } } }),
      this.prisma.weeklyReview.findFirst({
        where: { userId: user.id },
        orderBy: { weekStart: 'desc' },
        select: { id: true, weekStart: true, inactive: true, seenAt: true },
      }),
    ]);
    const weekStart = weekStartOf(date);
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
      const change = this.weekChange(habit, habitChanges, history.logs, weekStart, now);
      if (change) {
        item.change = change;
      }

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
      pendingReview:
        latestReview && !latestReview.seenAt
          ? { id: latestReview.id, weekStart: toDateString(latestReview.weekStart) }
          : null,
      // After an inactive week, until its review is opened.
      welcomeBack: Boolean(latestReview?.inactive && !latestReview.seenAt),
      groups,
      weeklyQuota,
    };
  }

  /** The level-up or deload that took effect this week (the badge on the card), if any. */
  private weekChange(
    habit: Habit,
    changes: readonly TargetChange[],
    logs: ReadonlyMap<string, unknown>,
    weekStart: string,
    now: Date,
  ): TodayHabit['change'] {
    const change = changes
      .filter(
        (candidate) =>
          candidate.kind !== 'MANUAL' &&
          candidate.undoneAt === null &&
          candidate.field !== 'DAYS_OF_WEEK' &&
          toDateString(candidate.effectiveFrom) === weekStart,
      )
      .at(-1);
    if (!change || change.kind === 'MANUAL' || change.field === 'DAYS_OF_WEEK') {
      return undefined;
    }
    const effectiveFrom = toDateString(change.effectiveFrom);
    const blocked = undoBlockReason(change, {
      now,
      hasLogSinceEffective: [...logs.keys()].some((date) => date >= effectiveFrom),
      currentValue: currentValueOf(habit, change.field),
    });
    return {
      id: change.id,
      kind: change.kind,
      field: change.field,
      fromValue: change.fromValue,
      toValue: change.toValue,
      canUndo: blocked === null,
    };
  }
}
