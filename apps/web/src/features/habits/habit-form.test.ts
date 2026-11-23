import { type HabitDto, projectLevels } from '@notch/shared';
import { describe, expect, it } from 'vitest';
import {
  changedFields,
  defaultValues,
  habitFormResolver,
  type HabitFormValues,
  isManualChange,
  previewText,
  resetForSchedule,
  resetForType,
  toHabitInput,
  valuesFromHabit,
} from './habit-form';

const today = '2026-11-18';
const coreId = '00000000-0000-4000-8000-000000000001';
const base = (fields: Partial<HabitFormValues> = {}): HabitFormValues => ({
  ...defaultValues({ coreId, today }),
  name: 'Read',
  ...fields,
});
const resolve = (values: HabitFormValues, editing = false) =>
  habitFormResolver({ today, editing })(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });
const errorsOf = async (values: HabitFormValues, editing = false) => {
  const { errors } = await resolve(values, editing);
  return Object.fromEntries(
    Object.entries(errors).map(([field, error]) => [field, error?.message]),
  );
};

const habit = (fields: Partial<HabitDto> = {}): HabitDto => ({
  id: '00000000-0000-4000-8000-0000000000aa',
  coreId,
  name: 'Run',
  type: 'DURATION',
  unit: null,
  targetValue: 1800,
  initialTargetValue: 1800,
  scheduleType: 'DAILY',
  daysOfWeek: [],
  timesPerWeek: null,
  initialTimesPerWeek: null,
  timeOfDay: 'MORNING',
  adaptiveEnabled: true,
  adaptiveApplicable: true,
  stepType: 'ABSOLUTE',
  stepValue: 300,
  minTarget: 900,
  maxTarget: 3600,
  longestStreak: 0,
  startDate: '2026-11-01',
  sortOrder: 0,
  archivedAt: null,
  ...fields,
});

describe('habit form: conversion', () => {
  it('sends durations, absolute steps and bounds in seconds', () => {
    const input = toHabitInput(
      base({
        type: 'DURATION',
        target: 30,
        stepType: 'ABSOLUTE',
        stepValue: 5,
        minTarget: 15,
        maxTarget: 60,
      }),
    );
    expect(input).toMatchObject({
      targetValue: 1800,
      stepValue: 300,
      minTarget: 900,
      maxTarget: 3600,
      unit: null,
    });
  });

  it('keeps a weekly toggle’s bounds in times a week, and leaves out a non-weekly toggle’s', () => {
    expect(
      toHabitInput(
        base({ scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 3, minTarget: 2, maxTarget: 6 }),
      ),
    ).toMatchObject({ targetValue: undefined, timesPerWeek: 3, minTarget: 2, maxTarget: 6 });
    expect(toHabitInput(base({ minTarget: 2 }))).toMatchObject({
      minTarget: null,
      maxTarget: null,
    });
  });

  it('only sends the days or the weekly count the schedule uses', () => {
    expect(toHabitInput(base({ daysOfWeek: [1, 3], timesPerWeek: 4 }))).toMatchObject({
      daysOfWeek: [],
      timesPerWeek: null,
    });
  });

  it('round-trips a saved habit', () => {
    const saved = habit();
    const values = valuesFromHabit(saved);
    expect(values).toMatchObject({
      target: 30,
      stepValue: 5,
      minTarget: 15,
      maxTarget: 60,
    });
    expect(changedFields(saved, values)).toEqual({});
  });
});

describe('habit form: validation uses the shared schema', () => {
  it('accepts a valid habit', async () => {
    expect(await errorsOf(base({ type: 'COUNT', target: 10, unit: 'pages' }))).toEqual({});
  });

  it.each<[string, Partial<HabitFormValues>, Record<string, string>]>([
    ['a missing name', { name: ' ' }, { name: 'Give it a name' }],
    ['a missing target', { type: 'COUNT', target: null }, { target: 'Set a target' }],
    ['a duration over 24 h', { type: 'DURATION', target: 1441 }, { target: 'At most 24 hours' }],
    ['a fraction', { type: 'COUNT', target: 1.5 }, { target: 'Use a whole number' }],
    [
      'no day picked',
      { scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [] },
      { daysOfWeek: 'Pick at least one day' },
    ],
    [
      'a percent step over 100',
      { type: 'COUNT', target: 5, stepValue: 150 },
      { stepValue: 'At most 100%' },
    ],
    [
      'an empty absolute step',
      { type: 'COUNT', target: 5, stepType: 'ABSOLUTE', stepValue: null },
      { stepValue: 'Set a step' },
    ],
    [
      'min above max',
      { type: 'COUNT', target: 5, minTarget: 4, maxTarget: 3 },
      { maxTarget: 'Must be at least the minimum' },
    ],
    [
      'a target below the minimum',
      { type: 'COUNT', target: 5, minTarget: 6 },
      { minTarget: 'The current target is below this minimum' },
    ],
    [
      'a weekly bound over 7',
      { scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 3, maxTarget: 8 },
      { maxTarget: 'At most 7 times per week' },
    ],
    [
      'a start date too far back',
      { startDate: '2026-11-11' },
      { startDate: 'Between 6 days ago and a year from now' },
    ],
  ])('%s', async (_name, fields, expected) => {
    expect(await errorsOf(base(fields))).toMatchObject(expected);
  });

  it('shows the cross-field problems together with the plain ones', async () => {
    expect(
      await errorsOf(base({ name: '', scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [] })),
    ).toMatchObject({
      name: 'Give it a name',
      daysOfWeek: 'Pick at least one day',
    });
  });

  it('does not check an old start date when editing', async () => {
    expect(await errorsOf(base({ startDate: '2026-01-01' }), true)).toEqual({});
  });
});

describe('habit form: switching', () => {
  it('a toggle has no target or unit; count and duration get a default target', () => {
    const count = base({
      type: 'COUNT',
      target: 12,
      unit: 'pages',
      stepType: 'ABSOLUTE',
      stepValue: 2,
      minTarget: 6,
    });
    expect(resetForType(count, 'TOGGLE')).toMatchObject({
      target: null,
      unit: '',
      stepType: 'PERCENT',
      minTarget: null,
    });
    expect(resetForType(count, 'DURATION')).toMatchObject({ target: 10, unit: '', stepValue: 10 });
    expect(resetForType(base(), 'COUNT')).toMatchObject({ target: 1 });
    expect(resetForType(count, 'COUNT')).toEqual({});
  });

  it('a new schedule clears the days, and a toggle’s bounds when its progression changes', () => {
    const weekly = base({ scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 5, minTarget: 2 });
    expect(resetForSchedule(weekly, 'DAILY')).toEqual({
      scheduleType: 'DAILY',
      daysOfWeek: [],
      timesPerWeek: 3,
      minTarget: null,
      maxTarget: null,
    });
    const count = base({
      type: 'COUNT',
      target: 5,
      minTarget: 2,
      scheduleType: 'SPECIFIC_DAYS',
      daysOfWeek: [1],
    });
    expect(resetForSchedule(count, 'DAILY')).not.toHaveProperty('minTarget');
  });
});

describe('habit form: editing', () => {
  it('sends only what changed', () => {
    const saved = habit({ scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [1, 3] });
    const values = { ...valuesFromHabit(saved), name: 'Run outside', daysOfWeek: [3, 1, 5] };
    expect(changedFields(saved, values)).toEqual({ name: 'Run outside', daysOfWeek: [1, 3, 5] });
  });

  it('flags target, days and weekly-count edits as manual changes', () => {
    const saved = habit();
    expect(isManualChange(saved, { ...valuesFromHabit(saved), name: 'Jog' })).toBe(false);
    expect(isManualChange(saved, { ...valuesFromHabit(saved), target: 45 })).toBe(true);
  });
});

describe('habit form: levels preview', () => {
  it('matches projectLevels for a duration', () => {
    const values = base({ type: 'DURATION', target: 10 });
    const levels = projectLevels(
      {
        type: 'DURATION',
        scheduleType: 'DAILY',
        stepType: 'PERCENT',
        stepValue: 10,
        minTarget: null,
        maxTarget: null,
      },
      600,
      3,
    ).map((level) => level.value / 60);
    expect(previewText(values)).toBe(
      `If you're consistent: ${levels.join(' → ')} min over the next 6 weeks.`,
    );
    expect(levels).toEqual([10, 11, 12, 13]);
  });

  it('counts a weekly toggle in times a week, stopping at the maximum', () => {
    expect(previewText(base({ scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 6 }))).toBe(
      "If you're consistent: 6× → 7× a week over the next 2 weeks, then it stays at the maximum.",
    );
    expect(previewText(base({ scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 7 }))).toBe(
      'Already at the maximum: it stays at 7× a week.',
    );
  });

  it('uses the unit for a count, and shows nothing without levels', () => {
    expect(
      previewText(
        base({ type: 'COUNT', target: 10, unit: 'pages', stepType: 'ABSOLUTE', stepValue: 5 }),
      ),
    ).toBe("If you're consistent: 10 → 15 → 20 → 25 pages over the next 6 weeks.");
    expect(previewText(base())).toBeNull();
    expect(previewText(base({ type: 'COUNT', target: 10, adaptiveEnabled: false }))).toBeNull();
  });
});
