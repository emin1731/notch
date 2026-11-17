import { describe, expect, it } from 'vitest';
import { todayIn } from './today.js';
import { addDays, daysBetween, isoWeekday, weekRange, weekStartOf } from './week.js';

describe('week helpers', () => {
  it('isoWeekday is Monday = 1 … Sunday = 7', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-22')).toBe(7);
  });

  it('weekStartOf returns the Monday, also across months and years', () => {
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16');
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });

  it('weekRange has seven consecutive days', () => {
    expect(weekRange('2026-10-26')).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });

  it('addDays and daysBetween handle leap years and DST weeks', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    // Europe/Berlin leaves summer time on 2026-10-25: local dates don't care.
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(daysBetween('2026-10-20', '2026-10-27')).toBe(7);
    expect(daysBetween('2026-10-27', '2026-10-20')).toBe(-7);
  });
});

describe('todayIn', () => {
  it('uses the local date of the timezone', () => {
    const now = new Date('2026-11-16T22:30:00Z');
    expect(todayIn('UTC', now)).toBe('2026-11-16');
    expect(todayIn('Asia/Baku', now)).toBe('2026-11-17');
    expect(todayIn('America/Los_Angeles', now)).toBe('2026-11-16');
  });

  it('crosses midnight correctly around the Berlin DST switch', () => {
    // 2026-10-25 03:00 CEST → 02:00 CET. Midnight on the 26th is 23:00 UTC on the 25th.
    expect(todayIn('Europe/Berlin', new Date('2026-10-25T22:59:59Z'))).toBe('2026-10-25');
    expect(todayIn('Europe/Berlin', new Date('2026-10-25T23:00:00Z'))).toBe('2026-10-26');
    // Before the switch, midnight was 22:00 UTC.
    expect(todayIn('Europe/Berlin', new Date('2026-10-24T22:00:00Z'))).toBe('2026-10-25');
  });

  it('rejects an unknown timezone', () => {
    expect(() => todayIn('Mars/Base', new Date())).toThrow(RangeError);
  });
});
