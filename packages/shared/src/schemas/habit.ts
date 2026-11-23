import { z } from 'zod';
import { LIMITS } from '../constants.js';
import { localDateSchema } from '../dates/local-date.js';
import { HABIT_TYPES, SCHEDULE_TYPES, STEP_TYPES, TIMES_OF_DAY } from '../enums.js';
import { habitShapeIssues } from '../habits/shape.js';
import { PROGRESSION_CONFIG } from '../progression/config.js';
import { queryBooleanSchema, uuidSchema } from './common.js';

export const habitNameSchema = z
  .string()
  .trim()
  .min(1, 'Give it a name')
  .max(80, 'Use at most 80 characters');
export const habitUnitSchema = z
  .string()
  .trim()
  .min(1, 'Enter a unit')
  .max(20, 'Use at most 20 characters');
const positiveInt = z.number().int('Use a whole number').min(1, 'At least 1');

/** ISO weekdays, deduplicated and sorted. */
export const daysOfWeekSchema = z
  .array(z.number().int().min(1).max(7))
  .max(7)
  .transform((days) => [...new Set(days)].sort((a, b) => a - b));

export const timesPerWeekSchema = z
  .number()
  .int()
  .min(1, 'At least once a week')
  .max(PROGRESSION_CONFIG.maxTimesPerWeek, 'At most 7 times a week');

/** A daily habit's "every N days" (1 = every day). */
export const intervalDaysSchema = z
  .number()
  .int('Use a whole number')
  .min(1, 'At least every day')
  .max(LIMITS.intervalDays, `At most every ${LIMITS.intervalDays} days`);

const shapeRefinement = (habit: Parameters<typeof habitShapeIssues>[0], ctx: z.RefinementCtx) => {
  for (const { path, message } of habitShapeIssues(habit)) {
    ctx.addIssue({ code: 'custom', path: [path], message });
  }
};

/**
 * Values are in the habit's units: count units, or seconds for durations (whole minutes).
 * `targetValue` can be left out for a toggle (it's always 1).
 */
export const createHabitSchema = z
  .object({
    coreId: uuidSchema,
    name: habitNameSchema,
    type: z.enum(HABIT_TYPES),
    unit: habitUnitSchema.nullish(),
    targetValue: positiveInt.optional(),
    scheduleType: z.enum(SCHEDULE_TYPES),
    daysOfWeek: daysOfWeekSchema.optional(),
    timesPerWeek: timesPerWeekSchema.nullish(),
    /** Defaults to 1 (every day) for a daily habit. */
    intervalDays: intervalDaysSchema.nullish(),
    timeOfDay: z.enum(TIMES_OF_DAY).default('ANYTIME'),
    /** Levels are opt-in. */
    adaptiveEnabled: z.boolean().default(false),
    stepType: z.enum(STEP_TYPES).default('PERCENT'),
    stepValue: positiveInt.default(PROGRESSION_CONFIG.defaultStepPercent),
    minTarget: positiveInt.nullish(),
    maxTarget: positiveInt.nullish(),
    /** Defaults to the local today; at most 6 days back (checked by the API). */
    startDate: localDateSchema.optional(),
  })
  .transform((input) => ({
    ...input,
    unit: input.unit ?? null,
    targetValue: input.targetValue ?? (input.type === 'TOGGLE' ? 1 : 0),
    daysOfWeek: input.daysOfWeek ?? [],
    timesPerWeek: input.timesPerWeek ?? null,
    intervalDays: input.intervalDays ?? (input.scheduleType === 'DAILY' ? 1 : null),
    minTarget: input.minTarget ?? null,
    maxTarget: input.maxTarget ?? null,
  }))
  .superRefine((habit, ctx) => {
    if (habit.targetValue === 0) {
      ctx.addIssue({ code: 'custom', path: ['targetValue'], message: 'Set a target' });
      return;
    }
    shapeRefinement(habit, ctx);
  });
export type CreateHabitInput = z.output<typeof createHabitSchema>;

/**
 * `type` and `scheduleType` can't change (create a new habit instead), and neither can
 * `startDate`. The API re-checks the cross-field rules on the merged habit.
 */
export const updateHabitSchema = z
  .strictObject({
    coreId: uuidSchema.optional(),
    name: habitNameSchema.optional(),
    unit: habitUnitSchema.nullable().optional(),
    targetValue: positiveInt.optional(),
    daysOfWeek: daysOfWeekSchema.optional(),
    timesPerWeek: timesPerWeekSchema.optional(),
    intervalDays: intervalDaysSchema.optional(),
    timeOfDay: z.enum(TIMES_OF_DAY).optional(),
    adaptiveEnabled: z.boolean().optional(),
    stepType: z.enum(STEP_TYPES).optional(),
    stepValue: positiveInt.optional(),
    minTarget: positiveInt.nullable().optional(),
    maxTarget: positiveInt.nullable().optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  });
export type UpdateHabitInput = z.output<typeof updateHabitSchema>;

export const listHabitsQuerySchema = z.object({
  coreId: uuidSchema.optional(),
  includeArchived: queryBooleanSchema,
});
export type ListHabitsQuery = z.output<typeof listHabitsQuerySchema>;
