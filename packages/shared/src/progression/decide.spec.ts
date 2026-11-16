import { describe, expect, it } from 'vitest';
import { addDays } from '../dates/week.js';
import { habitHistory } from '../progress/history.js';
import type { LogLite } from '../progress/progress.js';
import { daysToMask } from '../schedule/days.js';
import type { ScheduleSnapshot } from '../schedule/is-scheduled.js';
import { decideForHabit, type HabitForProgression } from './decide.js';
import type { ChangeLite } from './history.js';

// W is the week under review (Mon 2026-11-09 … Sun 11-15); W − 1 starts on 11-02.
const W = '2026-11-09';
const PREV = '2026-11-02';

const count: HabitForProgression = {
  type: 'COUNT',
  scheduleType: 'DAILY',
  stepType: 'PERCENT',
  stepValue: 10,
  minTarget: null,
  maxTarget: null,
  adaptiveEnabled: true,
  targetValue: 20,
  timesPerWeek: null,
};
const schedule = (
  habit: HabitForProgression,
  extra: Partial<ScheduleSnapshot> = {},
): ScheduleSnapshot => ({
  scheduleType: habit.scheduleType,
  daysOfWeek: [],
  timesPerWeek: habit.timesPerWeek,
  startDate: '2026-10-01',
  ...extra,
});

/** Logs on the given weekday offsets (0 = Monday) of a week, each `value` against `target`. */
const week = (start: string, offsets: number[], value: number, target = value): LogLite[] =>
  offsets.map((offset) => ({ date: addDays(start, offset), value, targetSnapshot: target }));
const ALL = [0, 1, 2, 3, 4, 5, 6];

const change = (
  kind: ChangeLite['kind'],
  effectiveFrom: string,
  fromValue: number,
  toValue: number,
  extra: Partial<ChangeLite> = {},
): ChangeLite => ({
  kind,
  field: 'TARGET_VALUE',
  fromValue,
  toValue,
  effectiveFrom,
  undone: false,
  createdAt: new Date(`${effectiveFrom}T06:00:00Z`),
  ...extra,
});

const decide = (
  habit: HabitForProgression,
  logs: LogLite[],
  {
    changes = [],
    inactiveWeek = false,
    scheduleExtra = {},
  }: {
    changes?: ChangeLite[];
    inactiveWeek?: boolean;
    scheduleExtra?: Partial<ScheduleSnapshot>;
  } = {},
) =>
  decideForHabit({
    habit,
    history: habitHistory(schedule(habit, scheduleExtra), changes, logs),
    weekStart: W,
    inactiveWeek,
  });

const fullTwoWeeks = (habit: HabitForProgression) => [
  ...week(PREV, ALL, habit.targetValue),
  ...week(W, ALL, habit.targetValue),
];

describe('decideForHabit: the 12 cases of plan section 11', () => {
  it('1. a new habit in its first, partial week → HOLD / NOT_ELIGIBLE', () => {
    const result = decide(count, week(W, [2, 3, 4, 5, 6], 20), {
      scheduleExtra: { startDate: addDays(W, 2) },
    });
    expect(result).toMatchObject({ decision: 'HOLD', reason: 'NOT_ELIGIBLE', rate: null });
  });

  it('2. two full weeks at ≥ 85% → LEVEL_UP by one step, durations rounded to minutes', () => {
    expect(decide(count, fullTwoWeeks(count))).toMatchObject({
      decision: 'LEVEL_UP',
      reason: 'CONSISTENT',
      rate: 1,
      previousRate: 1,
      field: 'TARGET_VALUE',
      fromValue: 20,
      toValue: 22,
    });
    const meditate = { ...count, type: 'DURATION' as const, targetValue: 1500 };
    expect(decide(meditate, fullTwoWeeks(meditate))).toMatchObject({
      decision: 'LEVEL_UP',
      toValue: 1680,
    });
  });

  it('3. one week ≥ 85% after a week at 80% → HOLD / STEADY', () => {
    const fivePerWeek = { ...count, scheduleType: 'TIMES_PER_WEEK' as const, timesPerWeek: 5 };
    const logs = [...week(PREV, [0, 1, 2, 3], 20), ...week(W, [0, 1, 2, 3, 4], 20)];
    expect(decide(fivePerWeek, logs)).toMatchObject({
      decision: 'HOLD',
      reason: 'STEADY',
      rate: 1,
      previousRate: 0.8,
    });
  });

  it("4. < 50% after a level-up → DELOAD back to that level-up's fromValue", () => {
    const habit = { ...count, targetValue: 22 };
    const logs = [...week(PREV, ALL, 22), ...week(W, [0, 1], 22)];
    const result = decide(habit, logs, { changes: [change('LEVEL_UP', PREV, 20, 22)] });
    expect(result).toMatchObject({
      decision: 'DELOAD',
      reason: 'STRUGGLING',
      fromValue: 22,
      toValue: 20,
    });
  });

  it('5. < 50% with no prior level-up → DELOAD by one step, clamped to the minimum', () => {
    const logs = week(W, [0, 1], 20);
    expect(decide(count, logs)).toMatchObject({ decision: 'DELOAD', toValue: 18 });
    expect(decide({ ...count, minTarget: 19 }, logs)).toMatchObject({
      decision: 'DELOAD',
      toValue: 19,
    });
  });

  it('6. at the minimum and struggling → AT_MIN; at the maximum and consistent → AT_MAX', () => {
    expect(decide({ ...count, minTarget: 20 }, week(W, [0], 20))).toMatchObject({
      decision: 'HOLD',
      reason: 'AT_MIN',
    });
    const capped = { ...count, maxTarget: 20 };
    expect(decide(capped, fullTwoWeeks(capped))).toMatchObject({
      decision: 'HOLD',
      reason: 'AT_MAX',
    });
  });

  it('7. a level-up undone in the last cycle, still consistent → HOLD / COOLDOWN', () => {
    const undone = change('LEVEL_UP', W, 20, 22, { undone: true });
    expect(decide(count, fullTwoWeeks(count), { changes: [undone] })).toMatchObject({
      decision: 'HOLD',
      reason: 'COOLDOWN',
    });
  });

  it('8. a manual target edit mid-week → that week is NOT_ELIGIBLE', () => {
    const edit = change('MANUAL', addDays(W, 2), 18, 20);
    expect(decide(count, fullTwoWeeks(count), { changes: [edit] })).toMatchObject({
      reason: 'NOT_ELIGIBLE',
      rate: null,
    });
  });

  it('9. an inactive week → HOLD / INACTIVE_WEEK', () => {
    expect(decide(count, week(PREV, ALL, 20), { inactiveWeek: true })).toMatchObject({
      decision: 'HOLD',
      reason: 'INACTIVE_WEEK',
    });
  });

  it('10. a daily toggle is NOT_ADAPTIVE; a 3×/week toggle goes to 4×, capped at 7', () => {
    const toggle = { ...count, type: 'TOGGLE' as const, targetValue: 1 };
    expect(decide(toggle, fullTwoWeeks(toggle))).toMatchObject({
      decision: 'HOLD',
      reason: 'NOT_ADAPTIVE',
      rate: 1,
    });

    const weekly = { ...toggle, scheduleType: 'TIMES_PER_WEEK' as const, timesPerWeek: 3 };
    const logs = [...week(PREV, [0, 2, 4], 1), ...week(W, [0, 2, 4], 1)];
    expect(decide(weekly, logs)).toMatchObject({
      decision: 'LEVEL_UP',
      field: 'TIMES_PER_WEEK',
      fromValue: 3,
      toValue: 4,
    });

    const daily7 = { ...weekly, timesPerWeek: 7 };
    expect(decide(daily7, fullTwoWeeks(toggle))).toMatchObject({
      decision: 'HOLD',
      reason: 'AT_MAX',
    });
  });

  it("11. a specific-days habit logged on an unscheduled day: the log doesn't affect the rate", () => {
    const mwf = { ...count, scheduleType: 'SPECIFIC_DAYS' as const };
    const result = decide(mwf, week(W, [0, 1, 2], 20), {
      scheduleExtra: { daysOfWeek: [1, 3, 5] },
    });
    expect(result.rate).toBe(2 / 3);
  });

  it('12. overachievement counts as one hit, not more', () => {
    expect(decide(count, week(W, [0], 60, 20)).rate).toBe(1 / 7);
  });
});

describe('decideForHabit: eligibility and history', () => {
  it('a weekday edit during the week makes it NOT_ELIGIBLE', () => {
    const mwf = { ...count, scheduleType: 'SPECIFIC_DAYS' as const };
    const days: ChangeLite = {
      ...change('MANUAL', addDays(W, 3), daysToMask([2, 4]), daysToMask([1, 3, 5])),
      field: 'DAYS_OF_WEEK',
    };
    const result = decide(mwf, fullTwoWeeks(mwf), {
      changes: [days],
      scheduleExtra: { daysOfWeek: [1, 3, 5] },
    });
    expect(result.reason).toBe('NOT_ELIGIBLE');
  });

  it('a change on the Monday keeps the week eligible, but W − 1 was at another value → STEADY', () => {
    const mondayEdit = change('MANUAL', W, 18, 20);
    const logs = [...week(PREV, ALL, 18), ...week(W, ALL, 20)];
    expect(decide(count, logs, { changes: [mondayEdit] })).toMatchObject({
      reason: 'STEADY',
      rate: 1,
      previousRate: 1,
    });
  });

  it('an undone change is ignored', () => {
    const undone = change('MANUAL', addDays(W, 2), 20, 25, { undone: true });
    expect(decide(count, fullTwoWeeks(count), { changes: [undone] })).toMatchObject({
      decision: 'LEVEL_UP',
    });
  });

  it('an edit after the week ended (before the review ran) → NOT_ELIGIBLE', () => {
    const edited = { ...count, targetValue: 25 };
    const after = change('MANUAL', addDays(W, 7), 20, 25);
    expect(decide(edited, fullTwoWeeks(count), { changes: [after] })).toMatchObject({
      reason: 'NOT_ELIGIBLE',
    });
  });

  it('a deload is also blocked by its own cooldown', () => {
    const undone = change('DELOAD', W, 20, 18, { undone: true });
    expect(decide(count, week(W, [0], 20), { changes: [undone] })).toMatchObject({
      reason: 'COOLDOWN',
    });
  });

  it('adaptive switched off → NOT_ADAPTIVE, with the rate still reported', () => {
    expect(decide({ ...count, adaptiveEnabled: false }, fullTwoWeeks(count))).toMatchObject({
      decision: 'HOLD',
      reason: 'NOT_ADAPTIVE',
      rate: 1,
    });
  });

  it("a deload doesn't return to a level-up that a later edit replaced", () => {
    const habit = { ...count, targetValue: 30 };
    const changes = [
      change('LEVEL_UP', PREV, 20, 22),
      change('MANUAL', PREV, 22, 30, { createdAt: new Date('2026-11-03T00:00:00Z') }),
    ];
    expect(decide(habit, week(W, [0], 30), { changes })).toMatchObject({
      decision: 'DELOAD',
      toValue: 27,
    });
  });
});
