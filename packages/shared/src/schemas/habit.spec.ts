import { describe, expect, it } from 'vitest';
import { createHabitSchema, updateHabitSchema } from './habit.js';

const coreId = '00000000-0000-4000-8000-000000000001';
const base = {
  coreId,
  name: 'Read',
  type: 'COUNT',
  unit: 'pages',
  targetValue: 20,
  scheduleType: 'DAILY',
};

const issues = (input: object) => {
  const result = createHabitSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('createHabitSchema', () => {
  it('fills defaults', () => {
    expect(createHabitSchema.parse(base)).toMatchObject({
      daysOfWeek: [],
      timesPerWeek: null,
      timeOfDay: 'ANYTIME',
      adaptiveEnabled: true,
      stepType: 'PERCENT',
      stepValue: 10,
      minTarget: null,
      maxTarget: null,
    });
  });

  it('a toggle defaults its target to 1 and rejects any other target', () => {
    const toggle = { coreId, name: 'Cold shower', type: 'TOGGLE', scheduleType: 'DAILY' };
    expect(createHabitSchema.parse(toggle).targetValue).toBe(1);
    expect(issues({ ...toggle, targetValue: 2 })).toEqual(['targetValue']);
  });

  it('count and duration need a target', () => {
    expect(issues({ ...base, targetValue: undefined })).toEqual(['targetValue']);
  });

  it('durations are whole minutes, at most 24 hours', () => {
    const meditate = { ...base, type: 'DURATION', unit: undefined, targetValue: 600 };
    expect(issues(meditate)).toEqual([]);
    expect(issues({ ...meditate, targetValue: 630 })).toEqual(['targetValue']);
    expect(issues({ ...meditate, targetValue: 25 * 3600 })).toEqual(['targetValue']);
    expect(issues({ ...meditate, stepType: 'ABSOLUTE', stepValue: 90 })).toEqual(['stepValue']);
  });

  it('only count habits have a unit', () => {
    expect(issues({ ...base, type: 'DURATION', targetValue: 600 })).toEqual(['unit']);
  });

  it('specific days need days, and only they have them', () => {
    expect(issues({ ...base, scheduleType: 'SPECIFIC_DAYS' })).toEqual(['daysOfWeek']);
    expect(issues({ ...base, scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [] })).toEqual([
      'daysOfWeek',
    ]);
    expect(
      createHabitSchema.parse({ ...base, scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [5, 1, 5] })
        .daysOfWeek,
    ).toEqual([1, 5]);
    expect(issues({ ...base, daysOfWeek: [1] })).toEqual(['daysOfWeek']);
    expect(issues({ ...base, scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [0, 8] })).toHaveLength(2);
  });

  it('N per week needs 1–7, and only it has a quota', () => {
    expect(issues({ ...base, scheduleType: 'TIMES_PER_WEEK' })).toEqual(['timesPerWeek']);
    expect(issues({ ...base, scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 8 })).toEqual([
      'timesPerWeek',
    ]);
    expect(issues({ ...base, timesPerWeek: 3 })).toEqual(['timesPerWeek']);
  });

  it('bounds must contain the current value', () => {
    expect(issues({ ...base, minTarget: 10, maxTarget: 40 })).toEqual([]);
    expect(issues({ ...base, minTarget: 25 })).toEqual(['minTarget']);
    expect(issues({ ...base, maxTarget: 15 })).toEqual(['maxTarget']);
    expect(issues({ ...base, minTarget: 30, maxTarget: 10 })).toContain('maxTarget');
  });

  it('a non-adaptive toggle has no bounds; a weekly toggle caps them at 7', () => {
    const toggle = { coreId, name: 'X', type: 'TOGGLE', scheduleType: 'DAILY' };
    expect(issues({ ...toggle, maxTarget: 3 })).toEqual(['minTarget']);
    const weekly = { ...toggle, scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 3 };
    expect(issues({ ...weekly, maxTarget: 6 })).toEqual([]);
    expect(issues({ ...weekly, maxTarget: 8 })).toEqual(['maxTarget']);
  });

  it('percent steps are at most 100', () => {
    expect(issues({ ...base, stepValue: 101 })).toEqual(['stepValue']);
  });
});

describe('updateHabitSchema', () => {
  it('refuses to change the type, schedule type or start date', () => {
    expect(updateHabitSchema.safeParse({ type: 'COUNT' }).success).toBe(false);
    expect(updateHabitSchema.safeParse({ scheduleType: 'DAILY' }).success).toBe(false);
    expect(updateHabitSchema.safeParse({ startDate: '2026-11-16' }).success).toBe(false);
  });

  it('requires something to update', () => {
    expect(updateHabitSchema.safeParse({}).success).toBe(false);
    expect(updateHabitSchema.parse({ targetValue: 25 })).toEqual({ targetValue: 25 });
  });
});
