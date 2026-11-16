import type { LocalDate } from '../dates/local-date.js';
import type { TargetField } from '../enums.js';
import type { ScheduleSnapshot } from '../schedule/is-scheduled.js';
import { daysToMask, maskToDays } from '../schedule/days.js';

export interface ChangeLite {
  field: TargetField;
  fromValue: number;
  toValue: number;
  effectiveFrom: LocalDate;
  /** Undone changes are treated as if they never happened. */
  undone: boolean;
  /** Orders two changes with the same `effectiveFrom`. */
  createdAt: Date;
}

/**
 * The value of `field` on `date`. Reads the change history: the last change in effect on that date
 * wins; before the first change, the first change's `fromValue`; with no changes, `current`.
 */
export function valueOn(
  field: TargetField,
  date: LocalDate,
  current: number,
  changes: readonly ChangeLite[],
): number {
  const relevant = changes
    .filter((change) => change.field === field && !change.undone)
    .toSorted(
      (a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  const inEffect = relevant.filter((change) => change.effectiveFrom <= date).at(-1);
  if (inEffect) {
    return inEffect.toValue;
  }
  return relevant[0]?.fromValue ?? current;
}

/** The habit's target (TARGET_VALUE) on `date`. */
export function targetOn(date: LocalDate, current: number, changes: readonly ChangeLite[]): number {
  return valueOn('TARGET_VALUE', date, current, changes);
}

/** The habit's schedule on `date`: weekdays and weekly frequency as they were then. */
export function scheduleOn(
  date: LocalDate,
  current: ScheduleSnapshot,
  changes: readonly ChangeLite[],
): ScheduleSnapshot {
  if (current.scheduleType === 'SPECIFIC_DAYS') {
    const mask = valueOn('DAYS_OF_WEEK', date, daysToMask(current.daysOfWeek), changes);
    return { ...current, daysOfWeek: maskToDays(mask) };
  }
  if (current.scheduleType === 'TIMES_PER_WEEK') {
    const times = valueOn('TIMES_PER_WEEK', date, current.timesPerWeek ?? 0, changes);
    return { ...current, timesPerWeek: times };
  }
  return current;
}
