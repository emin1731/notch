import type { ScheduleType } from '@notch/shared';
import type { HabitUnits } from './change-format';
import { formatValue } from './habit-format';

/** "87%", or "—" when there was nothing to count. */
export const percent = (rate: number | null) =>
  rate === null ? '—' : `${Math.round(rate * 100)}%`;

/** Weekly habits keep their streak in weeks, the rest in days: "day", "weeks". */
export const streakUnit = (count: number, scheduleType: ScheduleType) => {
  const unit = scheduleType === 'TIMES_PER_WEEK' ? 'week' : 'day';
  return count === 1 ? unit : `${unit}s`;
};

/** "21 days", "1 week". */
export const streakText = (count: number, scheduleType: ScheduleType) =>
  `${count} ${streakUnit(count, scheduleType)}`;

/** Everything logged in a range: "12 h 30 min", "340 pages", "18 times". */
export function totalText(habit: HabitUnits, total: number): string {
  if (habit.type === 'TOGGLE') {
    return `${total} ${total === 1 ? 'time' : 'times'}`;
  }
  return formatValue(habit.type, total, habit.unit);
}

/** "Oct 21 – Nov 19", with the years when it spans two: "Nov 20, 2025 – Nov 19, 2026". */
export function dateRangeText(from: string, to: string): string {
  const day = (date: string) => new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: from.slice(0, 4) === to.slice(0, 4) ? undefined : 'numeric',
    timeZone: 'UTC',
  }).formatRange(day(from), day(to));
}

/** "Tue, Nov 17" for a local date, whatever the browser's timezone. */
export const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
