import type { LocalDate } from '../dates/local-date.js';
import { addDays } from '../dates/week.js';
import type { TargetField } from '../enums.js';
import type { HabitHistory } from '../progress/history.js';
import { isHit } from '../progress/progress.js';
import { type ChangeLite, targetOn, valueOn } from '../progression/history.js';
import { isDueOn } from './habit-stats.js';
import type { DateWindow } from './range.js';

export interface HeatmapDay {
  date: LocalDate;
  value: number;
  /** The target in effect that day. */
  target: number;
  hit: boolean;
  /** False for days the habit wasn't due; a log there is a bonus and doesn't count. */
  scheduled: boolean;
}

export function buildHeatmap(
  history: HabitHistory,
  window: DateWindow,
  currentTarget: number,
): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  for (let date = window.from; date <= window.to; date = addDays(date, 1)) {
    const log = history.logs.get(date);
    days.push({
      date,
      value: log?.value ?? 0,
      target: targetOn(date, currentTarget, history.changes),
      hit: isHit(log),
      scheduled: isDueOn(history, date),
    });
  }
  return days;
}

/** Step points for a chart: the value at the window start, then each change inside it. */
export function targetSeries(
  field: TargetField,
  current: number,
  changes: readonly ChangeLite[],
  window: DateWindow,
): { date: LocalDate; target: number }[] {
  const points = [{ date: window.from, target: valueOn(field, window.from, current, changes) }];
  const dates = changes
    .filter(
      (change) =>
        change.field === field &&
        !change.undone &&
        change.effectiveFrom > window.from &&
        change.effectiveFrom <= window.to,
    )
    .map((change) => change.effectiveFrom)
    .toSorted();
  for (const date of new Set(dates)) {
    points.push({ date, target: valueOn(field, date, current, changes) });
  }
  return points;
}

/**
 * Per day, among daily and specific-days habits due that day: hits / due. Each habit's last day
 * counts only if hit. Times-per-week habits have no daily obligation, so they aren't included.
 */
export function dailySeries(
  habits: readonly { history: HabitHistory; window: DateWindow }[],
  range: DateWindow,
): { date: LocalDate; rate: number | null }[] {
  const daily = habits.filter(({ history }) => history.schedule.scheduleType !== 'TIMES_PER_WEEK');
  const series: { date: LocalDate; rate: number | null }[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    let due = 0;
    let hits = 0;
    for (const { history, window } of daily) {
      if (date < window.from || date > window.to || !isDueOn(history, date)) {
        continue;
      }
      const hit = isHit(history.logs.get(date));
      if (date === window.to && !hit) {
        continue;
      }
      due += 1;
      hits += hit ? 1 : 0;
    }
    series.push({ date, rate: due === 0 ? null : hits / due });
  }
  return series;
}
