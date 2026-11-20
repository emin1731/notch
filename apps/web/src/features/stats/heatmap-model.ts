import { addDays, type HeatmapDay, type LocalDate, weekStartOf } from '@notch/shared';
import type { HabitUnits } from '@/lib/change-format';
import { formatValue } from '@/lib/habit-format';
import { shortDate } from '@/lib/stats-format';

/** How much of the day's target was done: the cell's shade. */
export type HeatLevel = 'none' | 'low' | 'mid' | 'hit';

export function heatLevel(day: HeatmapDay): HeatLevel {
  if (day.hit) {
    return 'hit';
  }
  if (day.value <= 0) {
    return 'none';
  }
  return day.target > 0 && day.value / day.target >= 0.5 ? 'mid' : 'low';
}

/** Logged on a day the habit wasn't due: it shows, but doesn't count. */
export const isBonus = (day: HeatmapDay) => !day.scheduled && day.value > 0;

export interface HeatmapWeek {
  /** The week's Monday. */
  start: LocalDate;
  /** Monday first; null before the window starts or after it ends. */
  days: (HeatmapDay | null)[];
  /** "Nov" on the first week of each month (and the first week shown). */
  month: string | null;
}

const monthName = (date: LocalDate) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' });

/** Lays the window's days out as Monday-first week columns, the way the calendar reads. */
export function heatmapWeeks(days: readonly HeatmapDay[]): HeatmapWeek[] {
  const first = days[0];
  if (!first) {
    return [];
  }
  const byDate = new Map(days.map((day) => [day.date, day]));
  const last = days[days.length - 1]!.date;
  const weeks: HeatmapWeek[] = [];
  let previousMonth: string | null = null;
  for (let start = weekStartOf(first.date); start <= last; start = addDays(start, 7)) {
    const week = Array.from({ length: 7 }, (_, index) => byDate.get(addDays(start, index)) ?? null);
    const firstShown = week.find((day) => day !== null)!.date;
    const month = monthName(firstShown);
    weeks.push({ start, days: week, month: month === previousMonth ? null : month });
    previousMonth = month;
  }
  return weeks;
}

export interface DayContext {
  habit: HabitUnits;
  /** Weekly habits aren't due on any one day, so an empty day isn't "missed". */
  weekly: boolean;
  today: LocalDate;
}

/** What the day was, in words: a toggle is done or not, others say how much of the target. */
export function dayStatus(day: HeatmapDay, { habit, weekly, today }: DayContext): string {
  const value = (amount: number) => formatValue(habit.type, amount, habit.unit);
  if (!day.scheduled) {
    if (day.value <= 0) {
      return 'not scheduled';
    }
    return habit.type === 'TOGGLE'
      ? 'not scheduled, done anyway'
      : `not scheduled, bonus ${value(day.value)}`;
  }
  if (day.hit) {
    return habit.type === 'TOGGLE' ? 'done' : `${value(day.value)}, target hit`;
  }
  const empty = day.date === today ? 'not yet' : weekly ? 'nothing logged' : 'missed';
  if (habit.type === 'TOGGLE' || day.value <= 0) {
    return empty === 'missed' && habit.type === 'TOGGLE' ? 'not done' : empty;
  }
  return `${value(day.value)} of ${value(day.target)}`;
}

/** The cell's accessible name: "Tue, Nov 17: 25 min of 55 min". */
export const dayLabel = (day: HeatmapDay, context: DayContext) =>
  `${shortDate(day.date)}: ${dayStatus(day, context)}`;
