import type { HabitType, ScheduleType, StepType } from '../enums.js';
import { PROGRESSION_CONFIG } from '../progression/config.js';
import { progressingField } from '../progression/step.js';

/** The fields whose combinations are constrained (plan 5.2). */
export interface HabitShape {
  type: HabitType;
  unit: string | null;
  targetValue: number;
  scheduleType: ScheduleType;
  daysOfWeek: readonly number[];
  timesPerWeek: number | null;
  intervalDays: number | null;
  stepType: StepType;
  stepValue: number;
  minTarget: number | null;
  maxTarget: number | null;
}

export interface ShapeIssue {
  path: string;
  message: string;
}

export const MAX_TARGET = { COUNT: 100_000, DURATION: 24 * 60 * 60 } as const;

/**
 * Every cross-field rule of a habit. Used by `createHabitSchema`, and by the API on the merged
 * result of an update, so a partial update can't produce an invalid habit.
 */
export function habitShapeIssues(habit: HabitShape): ShapeIssue[] {
  const issues: ShapeIssue[] = [];
  const issue = (path: string, message: string) => issues.push({ path, message });

  if (habit.type === 'TOGGLE' && habit.targetValue !== 1) {
    issue('targetValue', "A toggle habit's target is always 1");
  }
  if (habit.type === 'COUNT' && habit.targetValue > MAX_TARGET.COUNT) {
    issue('targetValue', `At most ${MAX_TARGET.COUNT}`);
  }
  if (habit.type === 'DURATION') {
    if (habit.targetValue % 60 !== 0) {
      issue('targetValue', 'Durations are whole minutes (a multiple of 60 seconds)');
    }
    if (habit.targetValue > MAX_TARGET.DURATION) {
      issue('targetValue', 'At most 24 hours');
    }
  }
  if (habit.unit !== null && habit.type !== 'COUNT') {
    issue('unit', 'Only count habits have a unit');
  }

  if (habit.scheduleType === 'SPECIFIC_DAYS') {
    if (habit.daysOfWeek.length === 0) {
      issue('daysOfWeek', 'Pick at least one day');
    }
  } else if (habit.daysOfWeek.length > 0) {
    issue('daysOfWeek', 'Only for habits on specific days');
  }
  if (habit.scheduleType === 'TIMES_PER_WEEK') {
    if (habit.timesPerWeek === null) {
      issue('timesPerWeek', 'Required for habits done N times per week');
    }
  } else if (habit.timesPerWeek !== null) {
    issue('timesPerWeek', 'Only for habits done N times per week');
  }
  if (habit.scheduleType === 'DAILY') {
    if (habit.intervalDays === null) {
      issue('intervalDays', 'Required for daily habits');
    }
  } else if (habit.intervalDays !== null) {
    issue('intervalDays', 'Only for daily habits');
  }

  if (habit.stepType === 'PERCENT' && habit.stepValue > 100) {
    issue('stepValue', 'At most 100%');
  }
  if (habit.stepType === 'ABSOLUTE' && habit.type === 'DURATION' && habit.stepValue % 60 !== 0) {
    issue('stepValue', 'Durations are whole minutes (a multiple of 60 seconds)');
  }

  const field = progressingField(habit);
  if (field === null) {
    if (habit.minTarget !== null || habit.maxTarget !== null) {
      issue('minTarget', 'This habit is not adaptive, so it has no bounds');
    }
    return issues;
  }
  const value = field === 'TIMES_PER_WEEK' ? habit.timesPerWeek : habit.targetValue;
  const { minTarget, maxTarget } = habit;
  for (const [path, bound] of [
    ['minTarget', minTarget],
    ['maxTarget', maxTarget],
  ] as const) {
    if (bound === null) {
      continue;
    }
    if (field === 'TIMES_PER_WEEK' && bound > PROGRESSION_CONFIG.maxTimesPerWeek) {
      issue(path, 'At most 7 times per week');
    }
    if (field === 'TARGET_VALUE' && habit.type === 'DURATION' && bound % 60 !== 0) {
      issue(path, 'Durations are whole minutes (a multiple of 60 seconds)');
    }
  }
  if (minTarget !== null && maxTarget !== null && minTarget > maxTarget) {
    issue('maxTarget', 'Must be at least the minimum');
  }
  if (value !== null && minTarget !== null && value < minTarget) {
    issue('minTarget', 'The current target is below this minimum');
  }
  if (value !== null && maxTarget !== null && value > maxTarget) {
    issue('maxTarget', 'The current target is above this maximum');
  }
  return issues;
}
