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
