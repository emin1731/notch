import type { HabitDto, HabitType, ScheduleType } from '@notch/shared';

/** ISO weekday (1 = Monday … 7 = Sunday) → short and full names. */
export const WEEKDAYS = [
  { day: 1, short: 'Mon', long: 'Monday' },
  { day: 2, short: 'Tue', long: 'Tuesday' },
  { day: 3, short: 'Wed', long: 'Wednesday' },
  { day: 4, short: 'Thu', long: 'Thursday' },
  { day: 5, short: 'Fri', long: 'Friday' },
  { day: 6, short: 'Sat', long: 'Saturday' },
  { day: 7, short: 'Sun', long: 'Sunday' },
] as const;

/** "45 min", "1 h 30 min", "2 h" from whole minutes. */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${rest} min`;
  }
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** "45 min", "1 h 30 min" from seconds (durations are whole minutes). */
export const formatDuration = (seconds: number): string => formatMinutes(Math.round(seconds / 60));

/** A value in the habit's units: "20 min", "10 pages", "10" without a unit. */
export function formatValue(type: HabitType, value: number, unit: string | null): string {
  if (type === 'DURATION') {
    return formatDuration(value);
  }
  return unit ? `${value} ${unit}` : String(value);
}

/** The daily target, or nothing for a toggle (done or not). */
export function formatTarget(
  habit: Pick<HabitDto, 'type' | 'targetValue' | 'unit'>,
): string | null {
  return habit.type === 'TOGGLE' ? null : formatValue(habit.type, habit.targetValue, habit.unit);
}

/** A daily habit's interval: "Every day", "Every 3 days". */
export const intervalText = (days: number) => (days === 1 ? 'Every day' : `Every ${days} days`);

/** "Every day", "Every 2 days", "Weekdays", "Weekends", "Mon, Wed, Fri", "3× a week". */
export function scheduleText(habit: {
  scheduleType: ScheduleType;
  daysOfWeek: readonly number[];
  timesPerWeek: number | null;
  intervalDays: number | null;
}): string {
  if (habit.scheduleType === 'DAILY') {
    return intervalText(habit.intervalDays ?? 1);
  }
  if (habit.scheduleType === 'TIMES_PER_WEEK') {
    return `${habit.timesPerWeek ?? 1}× a week`;
  }
  const days = [...new Set(habit.daysOfWeek)].sort((a, b) => a - b);
  const key = days.join(',');
  if (key === '1,2,3,4,5,6,7') {
    return 'Every day';
  }
  if (key === '1,2,3,4,5') {
    return 'Weekdays';
  }
  if (key === '6,7') {
    return 'Weekends';
  }
  return days.map((day) => WEEKDAYS[day - 1]?.short).join(', ');
}

/** "Every day · 20 min": what a habit row says under its name. */
export function habitSummary(habit: HabitDto): string {
  return [scheduleText(habit), formatTarget(habit)].filter(Boolean).join(' · ');
}
