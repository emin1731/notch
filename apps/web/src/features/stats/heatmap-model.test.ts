import type { HeatmapDay } from '@notch/shared';
import { describe, expect, it } from 'vitest';
import { heatmapDays } from '@/test/stats-api';
import { type DayContext, dayLabel, heatLevel, heatmapWeeks, isBonus } from './heatmap-model';

const day = (fields: Partial<HeatmapDay>): HeatmapDay => ({
  date: '2026-11-17',
  value: 0,
  target: 3300,
  hit: false,
  scheduled: true,
  ...fields,
});

const duration: DayContext = {
  habit: { type: 'DURATION', unit: null },
  weekly: false,
  today: '2026-11-19',
};

describe('heatmap model', () => {
  it('shades by how much of the target was done', () => {
    expect(heatLevel(day({ value: 0 }))).toBe('none');
    expect(heatLevel(day({ value: 600 }))).toBe('low');
    expect(heatLevel(day({ value: 1800 }))).toBe('mid');
    expect(heatLevel(day({ value: 3300, hit: true }))).toBe('hit');
  });

  it('marks a log on a day off as a bonus', () => {
    expect(isBonus(day({ scheduled: false, value: 600 }))).toBe(true);
    expect(isBonus(day({ scheduled: false }))).toBe(false);
    expect(isBonus(day({ value: 600 }))).toBe(false);
  });

  it('lays a window that starts mid-week out in Monday-first columns', () => {
    // Wed, Nov 4 … Thu, Nov 19: three weeks, the first and last ones partial.
    const weeks = heatmapWeeks(heatmapDays('2026-11-19', 16));
    expect(weeks.map((week) => week.start)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(weeks[0]!.days.map((entry) => entry?.date ?? null)).toEqual([
      null,
      null,
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
      '2026-11-08',
    ]);
    expect(weeks[2]!.days.slice(3)).toEqual([
      expect.objectContaining({ date: '2026-11-19' }),
      null,
      null,
      null,
    ]);
  });

  it('names the month on the first week of each', () => {
    const weeks = heatmapWeeks(heatmapDays('2026-11-19', 30));
    expect(weeks.map((week) => week.month)).toEqual(['Oct', null, 'Nov', null, null]);
  });

  it('says each day in words', () => {
    expect(dayLabel(day({ value: 1500 }), duration)).toBe('Tue, Nov 17: 25 min of 55 min');
    expect(dayLabel(day({ value: 3300, hit: true }), duration)).toBe(
      'Tue, Nov 17: 55 min, target hit',
    );
    expect(dayLabel(day({}), duration)).toBe('Tue, Nov 17: missed');
    expect(dayLabel(day({ date: '2026-11-19' }), duration)).toBe('Thu, Nov 19: not yet');
    expect(dayLabel(day({ scheduled: false }), duration)).toBe('Tue, Nov 17: not scheduled');
    expect(dayLabel(day({ scheduled: false, value: 600 }), duration)).toBe(
      'Tue, Nov 17: not scheduled, bonus 10 min',
    );
    expect(dayLabel(day({}), { ...duration, weekly: true })).toBe('Tue, Nov 17: nothing logged');

    const toggle: DayContext = { ...duration, habit: { type: 'TOGGLE', unit: null } };
    expect(dayLabel(day({ value: 1, target: 1, hit: true }), toggle)).toBe('Tue, Nov 17: done');
    expect(dayLabel(day({ target: 1 }), toggle)).toBe('Tue, Nov 17: not done');
    expect(dayLabel(day({ scheduled: false, value: 1 }), toggle)).toBe(
      'Tue, Nov 17: not scheduled, done anyway',
    );
  });
});
