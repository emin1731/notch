import { DateTime } from 'luxon';
import type { LocalDate } from './local-date.js';

/** The local calendar date in `timeZone` at the instant `now`. Callers pass `now` in. */
export function todayIn(timeZone: string, now: Date): LocalDate {
  const local = DateTime.fromJSDate(now, { zone: timeZone });
  if (!local.isValid) {
    throw new RangeError(`Invalid timezone: ${timeZone}`);
  }
  return local.toISODate()!;
}

/** The instant local midnight starts `date` in `timeZone` (DST-aware). */
export function startOfDayIn(timeZone: string, date: LocalDate): Date {
  const local = DateTime.fromISO(date, { zone: timeZone }).startOf('day');
  if (!local.isValid) {
    throw new RangeError(`Invalid date or timezone: ${date} ${timeZone}`);
  }
  return local.toJSDate();
}
