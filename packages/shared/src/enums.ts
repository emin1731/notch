export const HABIT_TYPES = ['TOGGLE', 'COUNT', 'DURATION'] as const;
export type HabitType = (typeof HABIT_TYPES)[number];

export const SCHEDULE_TYPES = ['DAILY', 'SPECIFIC_DAYS', 'TIMES_PER_WEEK'] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export const TIMES_OF_DAY = ['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const STEP_TYPES = ['PERCENT', 'ABSOLUTE'] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const TARGET_CHANGE_KINDS = ['LEVEL_UP', 'DELOAD', 'MANUAL'] as const;
export type TargetChangeKind = (typeof TARGET_CHANGE_KINDS)[number];

/**
 * What a TargetChange changed. DAYS_OF_WEEK values are bitmasks (Mon = 1 … Sun = 64), so every
 * change fits the same `fromValue` / `toValue` integers.
 */
export const TARGET_FIELDS = ['TARGET_VALUE', 'TIMES_PER_WEEK', 'DAYS_OF_WEEK'] as const;
export type TargetField = (typeof TARGET_FIELDS)[number];
