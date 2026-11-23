import { describe, expect, it } from 'vitest';
import { addDays } from '../dates/week.js';
import { habitHistory } from '../progress/history.js';
import type { LogLite } from '../progress/progress.js';
import type { ChangeLite } from '../progression/history.js';
import { daysToMask } from '../schedule/days.js';
import type { ScheduleSnapshot } from '../schedule/is-scheduled.js';
import { averageRate, rangeStats } from './habit-stats.js';
import { habitWindow, rangeDates } from './range.js';
import { buildHeatmap, dailySeries, targetSeries } from './series.js';

// Thursday 2026-11-19; its week starts Monday 11-16. The 7-day range is Fri 11-13 … Thu 11-19.
const TODAY = '2026-11-19';
const day = (offset: number) => addDays(TODAY, offset);
const RANGE_7D = rangeDates('7d', TODAY);

const daily: ScheduleSnapshot = {
  scheduleType: 'DAILY',
  daysOfWeek: [],
  timesPerWeek: null,
  intervalDays: 1,
  startDate: '2026-10-01',
};
const weekly: ScheduleSnapshot = { ...daily, scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 3 };
const hits = (...offsets: number[]): LogLite[] =>
  offsets.map((offset) => ({ date: day(offset), value: 1, targetSnapshot: 1 }));

describe('ranges and windows', () => {
  it('Nd ends today, today included', () => {
    expect(RANGE_7D).toEqual({ from: '2026-11-13', to: TODAY });
    expect(rangeDates('365d', TODAY).from).toBe('2025-11-20');
  });

  it("clips to the habit's start and archive dates", () => {
    expect(habitWindow({ startDate: '2026-11-15', archiveDate: null }, RANGE_7D)).toEqual({
      from: '2026-11-15',
      to: TODAY,
    });
    expect(habitWindow({ startDate: '2026-01-01', archiveDate: '2026-11-17' }, RANGE_7D)).toEqual({
      from: '2026-11-13',
      to: '2026-11-17',
    });
    expect(habitWindow({ startDate: '2026-11-20', archiveDate: null }, RANGE_7D)).toBeNull();
    expect(
      habitWindow({ startDate: '2026-01-01', archiveDate: '2026-11-10' }, RANGE_7D),
    ).toBeNull();
  });
});

describe('rangeStats', () => {
  it('daily: the last day counts only once it is a hit', () => {
    expect(rangeStats(habitHistory(daily, [], hits(-6, -5, -4, -3, -2, -1)), RANGE_7D)).toEqual({
      hits: 6,
      occurrences: 6,
      rate: 1,
    });
    expect(rangeStats(habitHistory(daily, [], hits(-6, -5, -4, -3, -2, -1, 0)), RANGE_7D)).toEqual({
      hits: 7,
      occurrences: 7,
      rate: 1,
    });
    expect(rangeStats(habitHistory(daily, [], hits(-6)), RANGE_7D)).toEqual({
      hits: 1,
      occurrences: 6,
      rate: 1 / 6,
    });
  });

  it('an archived habit stops at its archive date, which is its last day', () => {
    const window = habitWindow({ startDate: '2026-01-01', archiveDate: day(-2) }, RANGE_7D)!;
    expect(rangeStats(habitHistory(daily, [], hits(-6, -5, -4)), window)).toEqual({
      hits: 3,
      occurrences: 4,
      rate: 0.75,
    });
  });

  it('bonus logs on days the habit wasn’t due don’t count', () => {
    const mwf = { ...daily, scheduleType: 'SPECIFIC_DAYS' as const, daysOfWeek: [1, 3, 5] };
    // Due: Fri 13, Mon 16, Wed 18. Logged: Fri, Sat (bonus), Mon, Tue (bonus).
    expect(rangeStats(habitHistory(mwf, [], hits(-6, -5, -3, -2)), RANGE_7D)).toEqual({
      hits: 2,
      occurrences: 3,
      rate: 2 / 3,
    });
  });

  it('uses the weekdays in effect on each day', () => {
    const mwf = { ...daily, scheduleType: 'SPECIFIC_DAYS' as const, daysOfWeek: [1, 3, 5] };
    const changes: ChangeLite[] = [
      {
        kind: 'MANUAL',
        field: 'DAYS_OF_WEEK',
        fromValue: daysToMask([2, 4]),
        toValue: daysToMask([1, 3, 5]),
        effectiveFrom: day(-3),
        undone: false,
        createdAt: new Date('2026-11-16T08:00:00Z'),
      },
    ];
    // Old schedule (Tue/Thu) for 13–15: nothing due. New (Mon/Wed/Fri) from 16: Mon 16, Wed 18.
    expect(rangeStats(habitHistory(mwf, changes, hits(-3, -1)), RANGE_7D)).toEqual({
      hits: 2,
      occurrences: 2,
      rate: 1,
    });
  });

  it('times per week: whole weeks touched, the current week only once met', () => {
    // Week 11-09: Mon/Wed/Fri hit (3/3). This week: Mon only so far (1/3), not counted yet.
    const logs = hits(-10, -8, -6, -3);
    expect(rangeStats(habitHistory(weekly, [], logs), RANGE_7D)).toEqual({
      hits: 3,
      occurrences: 3,
      rate: 1,
    });
    // Once this week's quota is met, it counts.
    expect(rangeStats(habitHistory(weekly, [], [...logs, ...hits(-2, -1)]), RANGE_7D)).toEqual({
      hits: 6,
      occurrences: 6,
      rate: 1,
    });
    // A weak full week counts as it was.
    expect(rangeStats(habitHistory(weekly, [], hits(-10)), RANGE_7D)).toEqual({
      hits: 1,
      occurrences: 3,
      rate: 1 / 3,
    });
  });

  it('averageRate skips habits without a rate', () => {
    expect(averageRate([1, 0.5, null])).toBe(0.75);
    expect(averageRate([null])).toBeNull();
    expect(averageRate([])).toBeNull();
  });
});

describe('dailySeries', () => {
  it('hits / due per day, leaving out weekly habits and a not-yet-done last day', () => {
    const a = {
      history: habitHistory(daily, [], hits(-6, -5, -4, -3, -2, -1, 0)),
      window: RANGE_7D,
    };
    const b = { history: habitHistory(daily, [], hits(-6, -4, -3, -2, -1)), window: RANGE_7D };
    const tpw = { history: habitHistory(weekly, [], []), window: RANGE_7D };
    expect(dailySeries([a, b, tpw], RANGE_7D).map((point) => point.rate)).toEqual([
      1, 0.5, 1, 1, 1, 1, 1,
    ]);
    expect(dailySeries([tpw], RANGE_7D).every((point) => point.rate === null)).toBe(true);
  });
});

describe('heatmap and target series', () => {
  const change = (
    effectiveFrom: string,
    fromValue: number,
    toValue: number,
    undone = false,
  ): ChangeLite => ({
    kind: 'LEVEL_UP',
    field: 'TARGET_VALUE',
    fromValue,
    toValue,
    effectiveFrom,
    undone,
    createdAt: new Date(`${effectiveFrom}T06:00:00Z`),
  });

  it('shows every day with its target, bonus logs included but unscheduled', () => {
    const mwf = { ...daily, scheduleType: 'SPECIFIC_DAYS' as const, daysOfWeek: [1, 3, 5] };
    const logs = [{ date: day(-2), value: 30, targetSnapshot: 30 }];
    const heatmap = buildHeatmap(habitHistory(mwf, [change(day(-3), 20, 30)], logs), RANGE_7D, 30);
    expect(heatmap).toHaveLength(7);
    expect(heatmap[0]).toEqual({
      date: day(-6),
      value: 0,
      target: 20,
      hit: false,
      scheduled: true,
    });
    expect(heatmap[4]).toEqual({
      date: day(-2),
      value: 30,
      target: 30,
      hit: true,
      scheduled: false,
    });
  });

  it('steps at each change inside the window, ignoring undone ones', () => {
    const changes = [
      change('2026-10-05', 20, 22),
      change('2026-10-19', 22, 24, true),
      change('2026-11-02', 22, 25),
    ];
    expect(targetSeries('TARGET_VALUE', 25, changes, { from: '2026-09-21', to: TODAY })).toEqual([
      { date: '2026-09-21', target: 20 },
      { date: '2026-10-05', target: 22 },
      { date: '2026-11-02', target: 25 },
    ]);
    expect(targetSeries('TARGET_VALUE', 25, changes, RANGE_7D)).toEqual([
      { date: '2026-11-13', target: 25 },
    ]);
  });
});
