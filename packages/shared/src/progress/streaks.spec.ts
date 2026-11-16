import { describe, expect, it } from 'vitest';
import { addDays } from '../dates/week.js';
import type { ChangeLite } from '../progression/history.js';
import { daysToMask } from '../schedule/days.js';
import type { ScheduleSnapshot } from '../schedule/is-scheduled.js';
import { habitHistory } from './history.js';
import { computeProgress, isHit, type LogLite } from './progress.js';
import { currentStreak, longestStreak } from './streaks.js';
import { weekStats } from './weekly-rate.js';

// Weeks start on Mondays: 2026-11-02, 11-09, 11-16 (Mon) … 11-22 (Sun).
const MON = '2026-11-16';
const day = (offset: number) => addDays(MON, offset);

const daily: ScheduleSnapshot = {
  scheduleType: 'DAILY',
  daysOfWeek: [],
  timesPerWeek: null,
  startDate: '2026-10-01',
};
const monWedFri: ScheduleSnapshot = {
  ...daily,
  scheduleType: 'SPECIFIC_DAYS',
  daysOfWeek: [1, 3, 5],
};
const threeTimes: ScheduleSnapshot = { ...daily, scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 3 };

/** Hits (value = target = 1) on the given day offsets from MON. */
const hits = (...offsets: number[]): LogLite[] =>
  offsets.map((offset) => ({ date: day(offset), value: 1, targetSnapshot: 1 }));

const history = (schedule: ScheduleSnapshot, logs: LogLite[], changes: ChangeLite[] = []) =>
  habitHistory(schedule, changes, logs);

describe('progress', () => {
  it('computeProgress caps at 1', () => {
    expect(computeProgress(10, 20)).toBe(0.5);
    expect(computeProgress(25, 20)).toBe(1);
    expect(computeProgress(0, 20)).toBe(0);
  });

  it('isHit compares with the snapshot', () => {
    expect(isHit({ value: 20, targetSnapshot: 20 })).toBe(true);
    expect(isHit({ value: 19, targetSnapshot: 20 })).toBe(false);
    expect(isHit(undefined)).toBe(false);
  });
});

describe('weekStats', () => {
  it('daily: hits / 7', () => {
    expect(weekStats(history(daily, hits(0, 1, 2, 3, 4, 5)), MON)).toEqual({
      hits: 6,
      occurrences: 7,
      rate: 6 / 7,
    });
  });

  it('specific days: only scheduled days count, bonus logs are ignored', () => {
    expect(weekStats(history(monWedFri, hits(0, 1, 2)), MON)).toEqual({
      hits: 2,
      occurrences: 3,
      rate: 2 / 3,
    });
  });

  it('times per week: hits are capped at the quota', () => {
    expect(weekStats(history(threeTimes, hits(0, 1, 2, 3, 4)), MON)).toEqual({
      hits: 3,
      occurrences: 3,
      rate: 1,
    });
  });

  it('overachievement is one hit; a miss below target is none', () => {
    const logs = [
      { date: day(0), value: 40, targetSnapshot: 20 },
      { date: day(1), value: 10, targetSnapshot: 20 },
    ];
    expect(weekStats(history(daily, logs), MON).hits).toBe(1);
  });

  it('counts hits only up to asOf, against the full week', () => {
    expect(weekStats(history(daily, hits(0, 1, 5)), MON, day(2))).toEqual({
      hits: 2,
      occurrences: 7,
      rate: 2 / 7,
    });
  });

  it('a habit started mid-week asks only for the days left', () => {
    const fromFriday = { ...daily, startDate: day(4) };
    expect(weekStats(history(fromFriday, hits(4, 5)), MON).occurrences).toBe(3);
    const weeklyFromSaturday = { ...threeTimes, startDate: day(5) };
    expect(weekStats(history(weeklyFromSaturday, hits(5, 6)), MON)).toEqual({
      hits: 2,
      occurrences: 2,
      rate: 1,
    });
    expect(weekStats(history({ ...daily, startDate: day(7) }, []), MON)).toEqual({
      hits: 0,
      occurrences: 0,
      rate: null,
    });
  });

  it('uses the weekdays in effect on each day', () => {
    // Was Tue/Thu until Wednesday, Mon/Wed/Fri from Wednesday on.
    const changes: ChangeLite[] = [
      {
        field: 'DAYS_OF_WEEK',
        fromValue: daysToMask([2, 4]),
        toValue: daysToMask([1, 3, 5]),
        effectiveFrom: day(2),
        undone: false,
        createdAt: new Date('2026-11-18T08:00:00Z'),
      },
    ];
    // Scheduled: Tue (old), Wed and Fri (new). Not Mon (old schedule), not Thu (new).
    expect(weekStats(history(monWedFri, hits(0, 1, 2, 3, 4), changes), MON)).toEqual({
      hits: 3,
      occurrences: 3,
      rate: 1,
    });
  });
});

describe('currentStreak', () => {
  it('daily: counts back over consecutive hits', () => {
    expect(currentStreak(history(daily, hits(-3, -2, -1, 0)), day(0))).toBe(4);
    expect(currentStreak(history(daily, hits(-3, -1, 0)), day(0))).toBe(2);
  });

  it("today not yet hit doesn't break it; yesterday missed does", () => {
    expect(currentStreak(history(daily, hits(-2, -1)), day(0))).toBe(2);
    expect(currentStreak(history(daily, hits(-3, -2)), day(0))).toBe(0);
  });

  it('specific days skip unscheduled days', () => {
    // Mon 9th, Wed 11th, Fri 13th, Mon 16th; Tue/Thu are off days.
    expect(currentStreak(history(monWedFri, hits(-7, -5, -3, 0)), day(1))).toBe(4);
    expect(currentStreak(history(monWedFri, hits(-7, -3, 0)), day(1))).toBe(2);
  });

  it('a bonus log on an off day neither adds nor breaks', () => {
    expect(currentStreak(history(monWedFri, hits(-3, -2, 0)), day(0))).toBe(2);
  });

  it('never counts before the start date', () => {
    expect(
      currentStreak(history({ ...daily, startDate: day(-1) }, hits(-3, -2, -1, 0)), day(0)),
    ).toBe(2);
  });

  it('times per week: weeks that met the quota; the unfinished current week is skipped', () => {
    const logs = hits(-14, -13, -12, -7, -6, -5, 0);
    expect(currentStreak(history(threeTimes, logs), day(2))).toBe(2);
    expect(currentStreak(history(threeTimes, [...logs, ...hits(1, 2)]), day(2))).toBe(3);
    const gap = hits(-14, -13, -12, -7, 0);
    expect(currentStreak(history(threeTimes, gap), day(2))).toBe(0);
  });
});

describe('longestStreak', () => {
  it('finds the longest run, including the current one', () => {
    expect(longestStreak(history(daily, hits(-10, -9, -8, -7, -5, -4)), day(0))).toBe(4);
    expect(longestStreak(history(daily, hits(-10, -5, -4, -3, -2, -1)), day(0))).toBe(5);
  });

  it('is never shorter than the current streak', () => {
    const h = history(monWedFri, hits(-7, -5, -3, 0));
    expect(longestStreak(h, day(1))).toBe(currentStreak(h, day(1)));
  });

  it('times per week', () => {
    const logs = hits(-21, -20, -19, -14, -13, -12, -7, 0, 1, 2);
    expect(longestStreak(history(threeTimes, logs), day(2))).toBe(2);
  });

  it('is 0 before the start date', () => {
    expect(longestStreak(history({ ...daily, startDate: day(5) }, []), day(0))).toBe(0);
  });
});
