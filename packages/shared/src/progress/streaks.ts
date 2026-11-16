import type { LocalDate } from '../dates/local-date.js';
import { addDays, weekStartOf } from '../dates/week.js';
import { scheduleOn } from '../progression/history.js';
import { isScheduledOn } from '../schedule/is-scheduled.js';
import type { HabitHistory } from './history.js';
import { isHit } from './progress.js';
import { weekStats } from './weekly-rate.js';

const isWeekly = (history: HabitHistory) => history.schedule.scheduleType === 'TIMES_PER_WEEK';

const isDue = (history: HabitHistory, date: LocalDate) =>
  isScheduledOn(scheduleOn(date, history.schedule, history.changes), date);

/** A TIMES_PER_WEEK week counts once its quota is met; a week that asks for nothing doesn't count. */
const weekMet = (history: HabitHistory, weekStart: LocalDate, asOf: LocalDate) => {
  const stats = weekStats(history, weekStart, asOf);
  return stats.occurrences > 0 && stats.hits >= stats.occurrences;
};

/**
 * Plan 2.6, as of `asOf`:
 * - DAILY / SPECIFIC_DAYS: consecutive scheduled days that were hits, counting back. A scheduled
 *   `asOf` that isn't hit yet doesn't break the streak; counting starts from the day before.
 * - TIMES_PER_WEEK: consecutive weeks that met their quota. The current week counts once met, and
 *   doesn't break the streak while unfinished.
 */
export function currentStreak(history: HabitHistory, asOf: LocalDate): number {
  const { startDate } = history.schedule;
  let streak = 0;

  if (isWeekly(history)) {
    const currentWeek = weekStartOf(asOf);
    for (let week = currentWeek; addDays(week, 6) >= startDate; week = addDays(week, -7)) {
      if (weekMet(history, week, asOf)) {
        streak += 1;
      } else if (week !== currentWeek) {
        break;
      }
    }
    return streak;
  }

  for (let date = asOf; date >= startDate; date = addDays(date, -1)) {
    if (!isDue(history, date)) {
      continue;
    }
    if (isHit(history.logs.get(date))) {
      streak += 1;
    } else if (date !== asOf) {
      break;
    }
  }
  return streak;
}

/** The longest run ever, by the same rules (so it includes the current streak). */
export function longestStreak(history: HabitHistory, asOf: LocalDate): number {
  const { startDate } = history.schedule;
  let longest = 0;
  let run = 0;

  if (isWeekly(history)) {
    const currentWeek = weekStartOf(asOf);
    for (let week = weekStartOf(startDate); week <= currentWeek; week = addDays(week, 7)) {
      if (weekMet(history, week, asOf)) {
        run += 1;
        longest = Math.max(longest, run);
      } else if (week !== currentWeek) {
        run = 0;
      }
    }
    return longest;
  }

  for (let date = startDate; date <= asOf; date = addDays(date, 1)) {
    if (!isDue(history, date)) {
      continue;
    }
    if (isHit(history.logs.get(date))) {
      run += 1;
      longest = Math.max(longest, run);
    } else if (date !== asOf) {
      run = 0;
    }
  }
  return longest;
}
