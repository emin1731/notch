import { z } from 'zod';

export const milestoneTitleSchema = z
  .string()
  .trim()
  .min(1, 'Give it a title')
  .max(200, 'Use at most 200 characters');

export const createMilestoneSchema = z.object({ title: milestoneTitleSchema });
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z.object({ title: milestoneTitleSchema });
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
