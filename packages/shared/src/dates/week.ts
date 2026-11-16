import { DateTime } from 'luxon';
import { fromDateString, type LocalDate } from './local-date.js';

/** Calendar math on local dates. No timezone is involved: a LocalDate is already local. */
function toDateTime(date: LocalDate): DateTime {
  return DateTime.fromJSDate(fromDateString(date), { zone: 'utc' });
}

function toLocalDate(dateTime: DateTime): LocalDate {
  return dateTime.toISODate()!;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return toLocalDate(toDateTime(date).plus({ days }));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round(toDateTime(to).diff(toDateTime(from), 'days').days);
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: LocalDate): number {
  return toDateTime(date).weekday;
}

/** The Monday of the ISO week containing `date`. */
export function weekStartOf(date: LocalDate): LocalDate {
  return addDays(date, 1 - isoWeekday(date));
}

/** The seven dates of the week starting on `weekStart`. */
export function weekRange(weekStart: LocalDate): LocalDate[] {
  return Array.from({ length: 7 }, (_, offset) => addDays(weekStart, offset));
}
