import { z } from 'zod';

export const milestoneTitleSchema = z.string().trim().min(1).max(200);

export const createMilestoneSchema = z.object({ title: milestoneTitleSchema });
export type CreateMilestoneInput = z.infer<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z.object({ title: milestoneTitleSchema });
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneSchema>;
