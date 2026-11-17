import type { LocalDate } from '../dates/local-date.js';
import { isoWeekday, weekRange } from '../dates/week.js';
import type { ScheduleType } from '../enums.js';

/** A habit's schedule on one day. Use `scheduleOn` to get it for a past date. */
export interface ScheduleSnapshot {
  scheduleType: ScheduleType;
  daysOfWeek: readonly number[];
  timesPerWeek: number | null;
  startDate: LocalDate;
}

/**
 * Whether the habit is due on `date`. A TIMES_PER_WEEK habit can be done on any day, so every day
 * from its start date counts.
 */
export function isScheduledOn(schedule: ScheduleSnapshot, date: LocalDate): boolean {
  if (date < schedule.startDate) {
    return false;
  }
  switch (schedule.scheduleType) {
    case 'DAILY':
    case 'TIMES_PER_WEEK':
      return true;
    case 'SPECIFIC_DAYS':
      return schedule.daysOfWeek.includes(isoWeekday(date));
  }
}

/**
 * How many completions the week starting on `weekStart` asks for. Days before the start date don't
 * count, so a habit started mid-week asks for less (a TIMES_PER_WEEK habit for at most the days
 * left).
 */
export function occurrencesInWeek(schedule: ScheduleSnapshot, weekStart: LocalDate): number {
  const days = weekRange(weekStart).filter((date) => isScheduledOn(schedule, date));
  if (schedule.scheduleType === 'TIMES_PER_WEEK') {
    return Math.min(schedule.timesPerWeek ?? 0, days.length);
  }
  return days.length;
}
