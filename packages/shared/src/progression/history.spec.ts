import { describe, expect, it } from 'vitest';
import type { ScheduleSnapshot } from '../schedule/is-scheduled.js';
import { daysToMask } from '../schedule/days.js';
import { type ChangeLite, scheduleOn, targetOn } from './history.js';

const change = (
  effectiveFrom: string,
  fromValue: number,
  toValue: number,
  extra: Partial<ChangeLite> = {},
): ChangeLite => ({
  kind: 'MANUAL',
  field: 'TARGET_VALUE',
  fromValue,
  toValue,
  effectiveFrom,
  undone: false,
  createdAt: new Date(`${effectiveFrom}T12:00:00Z`),
  ...extra,
});

describe('targetOn', () => {
  it('is the current value without changes', () => {
    expect(targetOn('2026-11-16', 20, [])).toBe(20);
  });

  it('reads the value in effect on each date, across several changes', () => {
    const changes = [change('2026-11-09', 20, 22), change('2026-11-23', 22, 25)];
    expect(targetOn('2026-11-01', 25, changes)).toBe(20);
    expect(targetOn('2026-11-09', 25, changes)).toBe(22);
    expect(targetOn('2026-11-22', 25, changes)).toBe(22);
    expect(targetOn('2026-11-23', 25, changes)).toBe(25);
  });

  it('ignores undone changes', () => {
    const changes = [change('2026-11-09', 20, 22), change('2026-11-16', 22, 24, { undone: true })];
    expect(targetOn('2026-11-20', 22, changes)).toBe(22);
  });

  it('uses the later of two changes on the same day', () => {
    const changes = [
      change('2026-11-16', 20, 30, { createdAt: new Date('2026-11-16T09:00:00Z') }),
      change('2026-11-16', 30, 25, { createdAt: new Date('2026-11-16T10:00:00Z') }),
    ];
    expect(targetOn('2026-11-16', 25, changes.toReversed())).toBe(25);
    expect(targetOn('2026-11-15', 25, changes)).toBe(20);
  });

  it('only reads TARGET_VALUE changes', () => {
    const changes = [change('2026-11-09', 3, 4, { field: 'TIMES_PER_WEEK' })];
    expect(targetOn('2026-11-01', 20, changes)).toBe(20);
  });
});

describe('scheduleOn', () => {
  const base: ScheduleSnapshot = {
    scheduleType: 'SPECIFIC_DAYS',
    daysOfWeek: [1, 3, 5],
    timesPerWeek: null,
    startDate: '2026-01-01',
  };

  it('reads past weekdays from DAYS_OF_WEEK changes', () => {
    const changes = [
      change('2026-11-16', daysToMask([2, 4]), daysToMask([1, 3, 5]), { field: 'DAYS_OF_WEEK' }),
    ];
    expect(scheduleOn('2026-11-15', base, changes).daysOfWeek).toEqual([2, 4]);
    expect(scheduleOn('2026-11-16', base, changes).daysOfWeek).toEqual([1, 3, 5]);
  });

  it('reads past weekly quotas from TIMES_PER_WEEK changes', () => {
    const tpw: ScheduleSnapshot = {
      ...base,
      scheduleType: 'TIMES_PER_WEEK',
      daysOfWeek: [],
      timesPerWeek: 4,
    };
    const changes = [change('2026-11-16', 3, 4, { field: 'TIMES_PER_WEEK' })];
    expect(scheduleOn('2026-11-10', tpw, changes).timesPerWeek).toBe(3);
    expect(scheduleOn('2026-11-17', tpw, changes).timesPerWeek).toBe(4);
  });

  it('leaves a daily habit alone', () => {
    const daily: ScheduleSnapshot = { ...base, scheduleType: 'DAILY', daysOfWeek: [] };
    expect(scheduleOn('2026-11-10', daily, [])).toEqual(daily);
  });
});
