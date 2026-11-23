import { describe, expect, it } from 'vitest';
import { daysToMask, maskToDays } from './days.js';
import { isScheduledOn, type ScheduleSnapshot } from './is-scheduled.js';

const daily: ScheduleSnapshot = {
  scheduleType: 'DAILY',
  daysOfWeek: [],
  timesPerWeek: null,
  intervalDays: 1,
  startDate: '2026-01-01',
};
const monWedFri: ScheduleSnapshot = {
  ...daily,
  intervalDays: null,
  scheduleType: 'SPECIFIC_DAYS',
  daysOfWeek: [1, 3, 5],
};
const threeTimes: ScheduleSnapshot = {
  ...daily,
  scheduleType: 'TIMES_PER_WEEK',
  timesPerWeek: 3,
  intervalDays: null,
};
const everyThird: ScheduleSnapshot = { ...daily, intervalDays: 3, startDate: '2026-11-16' };

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

  it('every N days from the start date, or from the day the interval changed', () => {
    expect(isScheduledOn(everyThird, '2026-11-16')).toBe(true);
    expect(isScheduledOn(everyThird, '2026-11-17')).toBe(false);
    expect(isScheduledOn(everyThird, '2026-11-18')).toBe(false);
    expect(isScheduledOn(everyThird, '2026-11-19')).toBe(true);
    expect(isScheduledOn({ ...everyThird, intervalFrom: '2026-11-17' }, '2026-11-20')).toBe(true);
    expect(isScheduledOn({ ...everyThird, intervalFrom: '2026-11-17' }, '2026-11-19')).toBe(false);
  });

  it('never before the start date', () => {
    const late = { ...daily, startDate: '2026-11-18' };
    expect(isScheduledOn(late, '2026-11-17')).toBe(false);
    expect(isScheduledOn(late, '2026-11-18')).toBe(true);
  });
});
