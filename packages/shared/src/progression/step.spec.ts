import { describe, expect, it } from 'vitest';
import {
  adaptiveApplicable,
  defaultMinTarget,
  increment,
  nextDeload,
  nextLevelUp,
  progressingField,
  type StepSettings,
} from './step.js';
import { projectLevels } from './preview.js';

const count: StepSettings = {
  type: 'COUNT',
  scheduleType: 'DAILY',
  stepType: 'PERCENT',
  stepValue: 10,
  minTarget: null,
  maxTarget: null,
};
const duration: StepSettings = { ...count, type: 'DURATION' };
const frequency: StepSettings = { ...count, type: 'TOGGLE', scheduleType: 'TIMES_PER_WEEK' };

describe('progressingField', () => {
  it.each<[StepSettings, string | null]>([
    [count, 'TARGET_VALUE'],
    [{ ...count, scheduleType: 'TIMES_PER_WEEK' }, 'TARGET_VALUE'],
    [duration, 'TARGET_VALUE'],
    [frequency, 'TIMES_PER_WEEK'],
    [{ ...frequency, scheduleType: 'DAILY' }, null],
    [{ ...frequency, scheduleType: 'SPECIFIC_DAYS' }, null],
  ])('%o → %s', (habit, field) => {
    expect(progressingField(habit)).toBe(field);
    expect(adaptiveApplicable(habit)).toBe(field !== null);
  });
});

describe('increment', () => {
  it('percent of the current value, at least the minimum increment', () => {
    expect(increment(count, 20)).toBe(2);
    expect(increment(count, 4)).toBe(1); // 0.4 → min 1
    expect(increment(count, 25)).toBe(3); // 2.5 rounds up
    expect(increment(duration, 600)).toBe(60);
    expect(increment(duration, 300)).toBe(60); // 30 s → min 60 s
  });

  it('absolute steps, and +1 for frequency', () => {
    expect(increment({ ...count, stepType: 'ABSOLUTE', stepValue: 5 }, 20)).toBe(5);
    expect(increment(frequency, 3)).toBe(1);
  });
});

describe('nextLevelUp', () => {
  it('adds the increment', () => {
    expect(nextLevelUp(count, 20)).toBe(22);
    expect(nextLevelUp(frequency, 3)).toBe(4);
  });

  it('rounds durations to whole minutes', () => {
    expect(nextLevelUp(duration, 1500)).toBe(1680); // 25 min + 2.5 min → 28 min
    expect(nextLevelUp({ ...duration, stepValue: 15 }, 600)).toBe(720); // 10 + 1.5 → 12 min
  });

  it('clamps to maxTarget and returns null at the max', () => {
    expect(nextLevelUp({ ...count, maxTarget: 21 }, 20)).toBe(21);
    expect(nextLevelUp({ ...count, maxTarget: 20 }, 20)).toBeNull();
    expect(nextLevelUp(frequency, 7)).toBeNull();
    expect(nextLevelUp({ ...frequency, maxTarget: 5 }, 5)).toBeNull();
  });
});

describe('nextDeload', () => {
  it('subtracts the increment, clamped to the minimum', () => {
    expect(nextDeload(count, 20)).toBe(18);
    expect(nextDeload({ ...count, minTarget: 19 }, 20)).toBe(19);
    expect(nextDeload(frequency, 3)).toBe(2);
  });

  it('returns to the level-up it undoes', () => {
    expect(nextDeload(count, 22, 20)).toBe(20);
    expect(nextDeload({ ...count, minTarget: 21 }, 22, 20)).toBe(21);
  });

  it('returns null at the minimum', () => {
    expect(nextDeload({ ...count, minTarget: 20 }, 20)).toBeNull();
    expect(nextDeload(count, 1)).toBeNull();
    expect(nextDeload(frequency, 1)).toBeNull();
    expect(nextDeload(duration, 60)).toBeNull();
  });

  it('keeps durations in whole minutes', () => {
    expect(nextDeload(duration, 1500)).toBe(1380); // 25 − 2.5 = 22.5 → 23 min (half up)
  });
});

describe('defaultMinTarget', () => {
  it('is half the initial value, rounded, never below the minimum increment', () => {
    expect(defaultMinTarget(count, 20)).toBe(10);
    expect(defaultMinTarget(count, 1)).toBe(1);
    expect(defaultMinTarget(duration, 900)).toBe(480); // 7.5 min → 8 min
    expect(defaultMinTarget(duration, 60)).toBe(60);
    expect(defaultMinTarget(frequency, 3)).toBe(2);
  });
});

describe('projectLevels', () => {
  it('lists the levels two weeks apart until the max', () => {
    expect(projectLevels({ ...count, maxTarget: 25 }, 20, 5)).toEqual([
      { week: 0, value: 20 },
      { week: 2, value: 22 },
      { week: 4, value: 24 },
      { week: 6, value: 25 },
    ]);
    expect(projectLevels(frequency, 6, 3)).toEqual([
      { week: 0, value: 6 },
      { week: 2, value: 7 },
    ]);
  });
});
