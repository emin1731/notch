import type { LocalDate } from '../dates/local-date.js';
import { addDays, weekStartOf } from '../dates/week.js';
import type { HabitHistory } from '../progress/history.js';
import { isHit } from '../progress/progress.js';
import { weekStats } from '../progress/weekly-rate.js';
import { scheduleOn } from '../progression/history.js';
import { isScheduledOn } from '../schedule/is-scheduled.js';
import type { DateWindow } from './range.js';

export interface RangeStats {
  hits: number;
  occurrences: number;
  rate: number | null;
}

/** Whether the habit was due on `date`, by the schedule it had then. */
export const isDueOn = (history: HabitHistory, date: LocalDate): boolean =>
  isScheduledOn(scheduleOn(date, history.schedule, history.changes), date);

/**
 * A habit's completion over its window (plan 2.5 over a range).
 * - DAILY / SPECIFIC_DAYS: hits on due days / due days. The window's last day counts only if hit.
 * - TIMES_PER_WEEK: whole weeks touched by the window (rounded out to Monday–Sunday), each
 *   min(hit days, quota) / quota. The last week counts only once its quota is met.
 * Logs on days the habit wasn't due ("bonus" logs) never count.
 */
export function rangeStats(history: HabitHistory, window: DateWindow): RangeStats {
  let hits = 0;
  let occurrences = 0;

  if (history.schedule.scheduleType === 'TIMES_PER_WEEK') {
    const lastWeek = weekStartOf(window.to);
    for (let week = weekStartOf(window.from); week <= lastWeek; week = addDays(week, 7)) {
      const stats = weekStats(history, week, week === lastWeek ? window.to : undefined);
      if (week === lastWeek && stats.hits < stats.occurrences) {
        continue;
      }
      hits += stats.hits;
      occurrences += stats.occurrences;
    }
  } else {
    for (let date = window.from; date <= window.to; date = addDays(date, 1)) {
      if (!isDueOn(history, date)) {
        continue;
      }
      const hit = isHit(history.logs.get(date));
      if (date === window.to && !hit) {
        continue;
      }
      occurrences += 1;
      hits += hit ? 1 : 0;
    }
  }
  return { hits, occurrences, rate: occurrences === 0 ? null : hits / occurrences };
}

/** The mean of the rates that exist; null when none do. */
export function averageRate(rates: readonly (number | null)[]): number | null {
  const present = rates.filter((rate): rate is number => rate !== null);
  return present.length === 0
    ? null
    : present.reduce((sum, rate) => sum + rate, 0) / present.length;
}
