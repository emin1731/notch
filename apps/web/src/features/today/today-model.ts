import {
  addDays,
  computeProgress,
  isHit,
  isLocalDate,
  type LocalDate,
  type LogWriteResult,
  PROGRESSION_CONFIG,
  type TodayHabit,
  type TodayResponse,
  weekStartOf,
} from '@notch/shared';
import { TODAY_COPY } from './copy';

/** Unsaved values shown in place of the server's, keyed by `overrideKey(date, habitId)`. */
export type Overrides = Readonly<Record<string, number>>;

export const overrideKey = (date: LocalDate, habitId: string) => `${date}:${habitId}`;

export const allHabits = (today: TodayResponse): TodayHabit[] => [
  ...today.groups.flatMap((group) => group.habits),
  ...today.weeklyQuota,
];

/** Average progress of the scheduled habits (the groups), as the API computes `dayProgress`. */
export function dayProgressOf(groups: TodayResponse['groups']): number | null {
  const habits = groups.flatMap((group) => group.habits);
  if (habits.length === 0) {
    return null;
  }
  return habits.reduce((sum, habit) => sum + habit.progress, 0) / habits.length;
}

/** A weekly habit's hits, adjusted for the day's log turning into a hit (or not). */
function weekAfter(habit: TodayHabit, log: TodayHabit['log']): TodayHabit['week'] {
  if (!habit.week) {
    return undefined;
  }
  const delta = Number(isHit(log ?? undefined)) - Number(isHit(habit.log ?? undefined));
  return { ...habit.week, hits: Math.max(0, habit.week.hits + delta) };
}

/**
 * The habit as it would be with `value` logged on its day: progress against the log's snapshot
 * (or the day's target for a new log), as the API does. The streak waits for the server.
 */
export function withValue(habit: TodayHabit, value: number): TodayHabit {
  const targetSnapshot = habit.log?.targetSnapshot ?? habit.target;
  const log = value > 0 ? { value, targetSnapshot } : null;
  return {
    ...habit,
    log,
    progress: log ? computeProgress(value, targetSnapshot) : 0,
    week: weekAfter(habit, log),
  };
}

function mapHabits(today: TodayResponse, map: (habit: TodayHabit) => TodayHabit): TodayResponse {
  const groups = today.groups.map((group) => ({ ...group, habits: group.habits.map(map) }));
  return {
    ...today,
    groups,
    weeklyQuota: today.weeklyQuota.map(map),
    dayProgress: dayProgressOf(groups),
  };
}

/** The day as it looks with the unsaved values applied. Unchanged (same object) without any. */
export function applyOverrides(today: TodayResponse, overrides: Overrides): TodayResponse {
  const prefix = `${today.date}:`;
  if (!Object.keys(overrides).some((key) => key.startsWith(prefix))) {
    return today;
  }
  return mapHabits(today, (habit) => {
    const value = overrides[overrideKey(today.date, habit.id)];
    return value === undefined ? habit : withValue(habit, value);
  });
}

/** A saved write's result, merged into the day: the server's log, progress and streak. */
export function mergeWriteResult(
  today: TodayResponse,
  habitId: string,
  result: LogWriteResult,
): TodayResponse {
  return mapHabits(today, (habit) =>
    habit.id === habitId
      ? {
          ...habit,
          log: result.log && { value: result.log.value, targetSnapshot: result.log.targetSnapshot },
          progress: result.habitProgress,
          currentStreak: result.currentStreak,
          week: weekAfter(habit, result.log),
        }
      : habit,
  );
}

/** Plan 14's line under the day's progress ring. */
export function progressMessage(dayProgress: number | null): string | null {
  if (dayProgress === null) {
    return null;
  }
  if (dayProgress === 0) {
    return TODAY_COPY.progress.none;
  }
  if (dayProgress < 0.5) {
    return TODAY_COPY.progress.started;
  }
  if (dayProgress < 1) {
    return TODAY_COPY.progress.halfway;
  }
  return TODAY_COPY.progress.done;
}

/** The earliest day that can still be logged. */
export const earliestDate = (today: LocalDate) => addDays(today, -PROGRESSION_CONFIG.backfillDays);

/** A `?date=` within the backfill window, or null (meaning: show today). */
export function clampDate(param: string | null, today: LocalDate): LocalDate | null {
  if (!param || !isLocalDate(param) || param > today || param < earliestDate(today)) {
    return null;
  }
  return param;
}

/** "Tuesday" for a local date, whatever the browser's timezone. */
export const weekdayName = (date: LocalDate) =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );

/** The note on a past day; it mentions the review only when the day is in an earlier week. */
export function backfillNote(date: LocalDate, today: LocalDate): string | null {
  if (date === today) {
    return null;
  }
  const day = weekdayName(date);
  return weekStartOf(date) < weekStartOf(today)
    ? TODAY_COPY.backfillEarlierWeek(day)
    : TODAY_COPY.backfill(day);
}
