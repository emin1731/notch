import type { LocalDate } from '../dates/local-date.js';
import { addDays } from '../dates/week.js';

export const STATS_RANGES = ['7d', '30d', '90d', '365d'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export interface DateWindow {
  from: LocalDate;
  /** The window's last day. It counts only if it's a hit: it may not be over yet. */
  to: LocalDate;
}

/** `Nd` is the N days ending today (local), today included. */
export function rangeDates(range: StatsRange, today: LocalDate): DateWindow {
  return { from: addDays(today, 1 - Number.parseInt(range, 10)), to: today };
}

/**
 * The part of the range a habit counts in: from its start date, up to its archive date (local) if
 * archived. Null when they don't overlap.
 */
export function habitWindow(
  habit: { startDate: LocalDate; archiveDate: LocalDate | null },
  range: DateWindow,
): DateWindow | null {
  const from = habit.startDate > range.from ? habit.startDate : range.from;
  const to =
    habit.archiveDate !== null && habit.archiveDate < range.to ? habit.archiveDate : range.to;
  return from <= to ? { from, to } : null;
}
