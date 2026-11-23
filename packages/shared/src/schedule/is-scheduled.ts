import type { LocalDate } from '../dates/local-date.js';
import { daysBetween, isoWeekday } from '../dates/week.js';
import type { ScheduleType } from '../enums.js';

/** A habit's schedule on one day. Use `scheduleOn` to get it for a past date. */
export interface ScheduleSnapshot {
  scheduleType: ScheduleType;
  daysOfWeek: readonly number[];
  timesPerWeek: number | null;
  /** DAILY only: due every N days (1 = every day). */
  intervalDays: number | null;
  startDate: LocalDate;
  /**
   * DAILY only: the day the interval in effect started, which is always due. Set by `scheduleOn`
   * from the change history; without it, the start date.
   */
  intervalFrom?: LocalDate;
}

/**
 * Whether the habit is due on `date`. A TIMES_PER_WEEK habit can be done on any day, so every day
 * from its start date counts. A daily habit every N days is due on its start date (or the day its
 * interval last changed), then every N days.
 */
export function isScheduledOn(schedule: ScheduleSnapshot, date: LocalDate): boolean {
  if (date < schedule.startDate) {
    return false;
  }
  switch (schedule.scheduleType) {
    case 'DAILY': {
      const interval = schedule.intervalDays ?? 1;
      const days = daysBetween(schedule.intervalFrom ?? schedule.startDate, date);
      return ((days % interval) + interval) % interval === 0;
    }
    case 'TIMES_PER_WEEK':
      return true;
    case 'SPECIFIC_DAYS':
      return schedule.daysOfWeek.includes(isoWeekday(date));
  }
}
