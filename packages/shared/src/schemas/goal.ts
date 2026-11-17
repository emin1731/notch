import { z } from 'zod';
import { LIMITS } from '../constants.js';
import { localDateSchema } from '../dates/local-date.js';
import { queryBooleanSchema, uuidSchema } from './common.js';
import { milestoneTitleSchema } from './milestone.js';

export const goalTitleSchema = z.string().trim().min(1).max(120);
export const goalDescriptionSchema = z.string().trim().max(1000);

export const createGoalSchema = z.object({
  coreId: uuidSchema,
  title: goalTitleSchema,
  description: goalDescriptionSchema.nullish(),
  deadline: localDateSchema.nullish(),
  milestones: z.array(milestoneTitleSchema).max(LIMITS.milestonesPerGoal).optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

/** `null` clears the description or deadline. */
export const updateGoalSchema = z
  .object({
    coreId: uuidSchema.optional(),
    title: goalTitleSchema.optional(),
    description: goalDescriptionSchema.nullable().optional(),
    deadline: localDateSchema.nullable().optional(),
    /** Confirms moving the goal's linked habits along with it to the new core. */
    moveHabits: z.boolean().optional(),
  })
  .refine(
    ({ moveHabits: _moveHabits, ...value }) =>
      Object.values(value).some((field) => field !== undefined),
    { message: 'Nothing to update' },
  );
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const listGoalsQuerySchema = z.object({
  coreId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'COMPLETED']).optional(),
  includeArchived: queryBooleanSchema,
});
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;
