import type { LocalDate } from '../dates/local-date.js';
import { weekRange } from '../dates/week.js';
import { scheduleOn } from '../progression/history.js';
import { isScheduledOn } from '../schedule/is-scheduled.js';
import type { HabitHistory } from './history.js';
import { isHit } from './progress.js';

export interface WeekStats {
  hits: number;
  /** What the week asks for. 0 when the habit didn't exist yet. */
  occurrences: number;
  /** hits / occurrences, or null when the week asks for nothing. */
  rate: number | null;
}

/**
 * Plan 2.5, for the week starting on `weekStart`, counting hits up to `asOf` (default: the whole
 * week). Each day uses the schedule in effect on it, and logs on unscheduled days don't count.
 * - DAILY / SPECIFIC_DAYS: hits on scheduled days / scheduled days
 * - TIMES_PER_WEEK: min(hit days, quota) / quota, where the quota is the one in effect on the last
 *   counted day, capped by the days the habit existed that week
 */
export function weekStats(
  history: HabitHistory,
  weekStart: LocalDate,
  asOf?: LocalDate,
): WeekStats {
  const days = weekRange(weekStart);
  const counted = days.filter((date) => asOf === undefined || date <= asOf);
  const { startDate } = history.schedule;

  if (history.schedule.scheduleType === 'TIMES_PER_WEEK') {
    const lastDay = counted.at(-1) ?? weekStart;
    const quota = scheduleOn(lastDay, history.schedule, history.changes).timesPerWeek ?? 0;
    const occurrences = Math.min(quota, days.filter((date) => date >= startDate).length);
    const hitDays = counted.filter(
      (date) => date >= startDate && isHit(history.logs.get(date)),
    ).length;
    const hits = Math.min(hitDays, occurrences);
    return { hits, occurrences, rate: occurrences === 0 ? null : hits / occurrences };
  }

  const scheduled = (date: LocalDate) =>
    isScheduledOn(scheduleOn(date, history.schedule, history.changes), date);
  const occurrences = days.filter(scheduled).length;
  const hits = counted.filter((date) => scheduled(date) && isHit(history.logs.get(date))).length;
  return { hits, occurrences, rate: occurrences === 0 ? null : hits / occurrences };
}
