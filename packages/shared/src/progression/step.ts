import type { HabitType, ScheduleType, StepType, TargetField } from '../enums.js';
import { PROGRESSION_CONFIG } from './config.js';

export interface StepSettings {
  type: HabitType;
  scheduleType: ScheduleType;
  stepType: StepType;
  /** Percent, or units / seconds when ABSOLUTE. */
  stepValue: number;
  minTarget: number | null;
  maxTarget: number | null;
}

/**
 * The field adaptive difficulty moves: the target for COUNT and DURATION, the weekly frequency for
 * a TIMES_PER_WEEK toggle, and nothing for other toggles.
 */
export function progressingField(
  habit: Pick<StepSettings, 'type' | 'scheduleType'>,
): Exclude<TargetField, 'DAYS_OF_WEEK'> | null {
  if (habit.type !== 'TOGGLE') {
    return 'TARGET_VALUE';
  }
  return habit.scheduleType === 'TIMES_PER_WEEK' ? 'TIMES_PER_WEEK' : null;
}

export function adaptiveApplicable(habit: Pick<StepSettings, 'type' | 'scheduleType'>): boolean {
  return progressingField(habit) !== null;
}

const isFrequency = (habit: StepSettings) => progressingField(habit) === 'TIMES_PER_WEEK';

function minIncrement(habit: StepSettings): number {
  if (isFrequency(habit)) {
    return PROGRESSION_CONFIG.minIncrement.FREQUENCY;
  }
  return habit.type === 'DURATION'
    ? PROGRESSION_CONFIG.minIncrement.DURATION
    : PROGRESSION_CONFIG.minIncrement.COUNT;
}

/** Durations are kept in whole minutes, and never below one. */
function roundForType(habit: StepSettings, value: number): number {
  if (habit.type === 'DURATION' && !isFrequency(habit)) {
    return Math.max(60, Math.round(value / 60) * 60);
  }
  return Math.round(value);
}

/** The step from `current`: always 1 for frequency, otherwise from the step settings. */
export function increment(habit: StepSettings, current: number): number {
  if (isFrequency(habit)) {
    return 1;
  }
  const raw =
    habit.stepType === 'ABSOLUTE' ? habit.stepValue : Math.round((current * habit.stepValue) / 100);
  return Math.max(minIncrement(habit), raw);
}

/** 50% of the initial value, rounded (at least 1 unit, 60 s or 1×). */
export function defaultMinTarget(habit: StepSettings, initial: number): number {
  const half = initial * PROGRESSION_CONFIG.defaultMinTargetRatio;
  return Math.max(minIncrement(habit), roundForType(habit, half));
}

export function upperBound(habit: StepSettings): number {
  const hardMax = isFrequency(habit) ? PROGRESSION_CONFIG.maxTimesPerWeek : Infinity;
  return Math.min(habit.maxTarget ?? Infinity, hardMax);
}

export function lowerBound(habit: StepSettings): number {
  return Math.max(habit.minTarget ?? 0, minIncrement(habit));
}

/** The value after a level-up, or null when already at the maximum (→ HOLD / AT_MAX). */
export function nextLevelUp(habit: StepSettings, current: number): number | null {
  const next = Math.min(
    roundForType(habit, current + increment(habit, current)),
    upperBound(habit),
  );
  return next > current ? next : null;
}

/**
 * The value after a deload, or null when already at the minimum (→ HOLD / AT_MIN). When the current
 * value came from a level-up, the deload returns to that level-up's `fromValue`.
 */
export function nextDeload(
  habit: StepSettings,
  current: number,
  levelUpFromValue?: number,
): number | null {
  const target = levelUpFromValue ?? roundForType(habit, current - increment(habit, current));
  const next = Math.max(target, lowerBound(habit));
  return next < current ? next : null;
}
