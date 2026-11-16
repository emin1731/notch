import type { LocalDate } from '../dates/local-date.js';
import { addDays } from '../dates/week.js';
import type { HabitHistory } from '../progress/history.js';
import { weekStats } from '../progress/weekly-rate.js';
import { PROGRESSION_CONFIG } from './config.js';
import { isEligibleWeek, isUnderCooldown } from './eligibility.js';
import { type ChangeLite, valueOn } from './history.js';
import { nextDeload, nextLevelUp, progressingField, type StepSettings } from './step.js';

export const DECISIONS = ['LEVEL_UP', 'DELOAD', 'HOLD'] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_REASONS = [
  'NOT_ELIGIBLE',
  'NOT_ADAPTIVE',
  'INACTIVE_WEEK',
  'COOLDOWN',
  'AT_MAX',
  'AT_MIN',
  'CONSISTENT',
  'STRUGGLING',
  'STEADY',
] as const;
export type DecisionReason = (typeof DECISION_REASONS)[number];

export interface HabitForProgression extends StepSettings {
  adaptiveEnabled: boolean;
  /** Current values; the field that progresses depends on the habit (`progressingField`). */
  targetValue: number;
  timesPerWeek: number | null;
}

export interface DecisionResult {
  decision: Decision;
  reason: DecisionReason;
  /** The week's rate, or null when the week isn't eligible. */
  rate: number | null;
  previousRate: number | null;
  field: 'TARGET_VALUE' | 'TIMES_PER_WEEK' | null;
  /** Set for LEVEL_UP and DELOAD. */
  fromValue?: number;
  toValue?: number;
}

/**
 * Plan 6.5: the decision for one habit after the week starting `weekStart` (W) ended. Pure: the
 * caller passes the habit's full change and log history, and whether W was inactive overall.
 */
export function decideForHabit({
  habit,
  history,
  weekStart,
  inactiveWeek,
  config = PROGRESSION_CONFIG,
}: {
  habit: HabitForProgression;
  history: HabitHistory;
  weekStart: LocalDate;
  inactiveWeek: boolean;
  config?: typeof PROGRESSION_CONFIG;
}): DecisionResult {
  const field = progressingField(habit);
  const previousWeek = addDays(weekStart, -7);
  const eligible = isEligibleWeek(history, weekStart);
  const previousEligible = isEligibleWeek(history, previousWeek);
  const rate = eligible ? weekStats(history, weekStart).rate : null;
  const previousRate = previousEligible ? weekStats(history, previousWeek).rate : null;
  const hold = (reason: DecisionReason): DecisionResult => ({
    decision: 'HOLD',
    reason,
    rate,
    previousRate,
    field,
  });

  if (field === null || !habit.adaptiveEnabled) {
    return hold('NOT_ADAPTIVE');
  }
  if (inactiveWeek) {
    return hold('INACTIVE_WEEK');
  }
  const current = field === 'TIMES_PER_WEEK' ? (habit.timesPerWeek ?? 0) : habit.targetValue;
  const valueAt = (date: LocalDate) => valueOn(field, date, current, history.changes);
  // The value must still be the one the week was done at (no edit since the week ended).
  if (rate === null || valueAt(addDays(weekStart, 6)) !== current) {
    return { ...hold('NOT_ELIGIBLE'), rate: null };
  }

  if (rate < config.deloadBelow) {
    if (isUnderCooldown(history.changes, 'DELOAD', weekStart)) {
      return hold('COOLDOWN');
    }
    const toValue = nextDeload(habit, current, levelUpFromValue(history.changes, field, current));
    return toValue === null
      ? hold('AT_MIN')
      : { ...hold('STRUGGLING'), decision: 'DELOAD', fromValue: current, toValue };
  }

  const consistent =
    rate >= config.levelUpAtOrAbove &&
    previousRate !== null &&
    previousRate >= config.levelUpAtOrAbove &&
    // Same value through W − 1 (eligibility already rules out a change inside it).
    valueAt(addDays(previousWeek, 6)) === current;
  if (consistent) {
    if (isUnderCooldown(history.changes, 'LEVEL_UP', weekStart)) {
      return hold('COOLDOWN');
    }
    const toValue = nextLevelUp(habit, current);
    return toValue === null
      ? hold('AT_MAX')
      : { ...hold('CONSISTENT'), decision: 'LEVEL_UP', fromValue: current, toValue };
  }
  return hold('STEADY');
}

/**
 * When the current value came from a level-up (the latest change of the field, not undone), a
 * deload returns to that level-up's starting value.
 */
function levelUpFromValue(
  changes: readonly ChangeLite[],
  field: 'TARGET_VALUE' | 'TIMES_PER_WEEK',
  current: number,
): number | undefined {
  const latest = changes
    .filter((change) => change.field === field && !change.undone)
    .toSorted(
      (a, b) =>
        a.effectiveFrom.localeCompare(b.effectiveFrom) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    )
    .at(-1);
  return latest?.kind === 'LEVEL_UP' && latest.toValue === current ? latest.fromValue : undefined;
}
