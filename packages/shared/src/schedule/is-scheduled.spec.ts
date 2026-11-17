import { describe, expect, it } from 'vitest';
import { daysToMask, maskToDays } from './days.js';
import { isScheduledOn, occurrencesInWeek, type ScheduleSnapshot } from './is-scheduled.js';

const WEEK = '2026-11-16'; // a Monday
const daily: ScheduleSnapshot = {
  scheduleType: 'DAILY',
  daysOfWeek: [],
  timesPerWeek: null,
  startDate: '2026-01-01',
};
const monWedFri: ScheduleSnapshot = {
  ...daily,
  scheduleType: 'SPECIFIC_DAYS',
  daysOfWeek: [1, 3, 5],
};
const threeTimes: ScheduleSnapshot = { ...daily, scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 3 };

describe('day masks', () => {
  it('round-trips', () => {
    expect(daysToMask([1, 3, 5])).toBe(0b10101);
    expect(daysToMask([7])).toBe(64);
    expect(maskToDays(0b1111111)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(maskToDays(daysToMask([2, 6]))).toEqual([2, 6]);
  });
});

describe('isScheduledOn', () => {
  it('daily and N-per-week habits are due every day', () => {
    expect(isScheduledOn(daily, '2026-11-17')).toBe(true);
    expect(isScheduledOn(threeTimes, '2026-11-22')).toBe(true);
  });

  it('specific days only on those weekdays', () => {
    expect(isScheduledOn(monWedFri, '2026-11-16')).toBe(true);
    expect(isScheduledOn(monWedFri, '2026-11-17')).toBe(false);
    expect(isScheduledOn(monWedFri, '2026-11-20')).toBe(true);
  });

  it('never before the start date', () => {
    const late = { ...daily, startDate: '2026-11-18' };
    expect(isScheduledOn(late, '2026-11-17')).toBe(false);
    expect(isScheduledOn(late, '2026-11-18')).toBe(true);
  });
});

describe('occurrencesInWeek', () => {
  it('counts scheduled days, or the weekly quota', () => {
    expect(occurrencesInWeek(daily, WEEK)).toBe(7);
    expect(occurrencesInWeek(monWedFri, WEEK)).toBe(3);
    expect(occurrencesInWeek(threeTimes, WEEK)).toBe(3);
  });

  it('a habit started mid-week asks only for the days left', () => {
    const fromThursday = '2026-11-19';
    expect(occurrencesInWeek({ ...daily, startDate: fromThursday }, WEEK)).toBe(4);
    expect(occurrencesInWeek({ ...monWedFri, startDate: fromThursday }, WEEK)).toBe(1);
    expect(occurrencesInWeek({ ...threeTimes, startDate: '2026-11-21' }, WEEK)).toBe(2);
    expect(occurrencesInWeek({ ...daily, startDate: '2026-11-23' }, WEEK)).toBe(0);
  });
});
