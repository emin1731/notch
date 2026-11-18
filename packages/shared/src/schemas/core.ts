import { z } from 'zod';
import { COLOR_PALETTE, LIMITS } from '../constants.js';
import { queryBooleanSchema } from './common.js';

export const coreNameSchema = z
  .string()
  .trim()
  .min(1, 'Give it a name')
  .max(40, 'Use at most 40 characters');
export const coreColorSchema = z.enum(COLOR_PALETTE);
/** A lucide icon name, e.g. "heart-pulse". */
export const iconSchema = z.string().regex(/^[a-z0-9-]{1,50}$/, { message: 'Invalid icon name' });

export const createCoreSchema = z.object({
  name: coreNameSchema,
  color: coreColorSchema,
  icon: iconSchema,
});
export type CreateCoreInput = z.infer<typeof createCoreSchema>;

export const updateCoreSchema = createCoreSchema
  .partial()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update',
  });
export type UpdateCoreInput = z.infer<typeof updateCoreSchema>;

export const batchCoresSchema = z.object({
  cores: z.array(createCoreSchema).min(1).max(LIMITS.batchCores),
});
export type BatchCoresInput = z.infer<typeof batchCoresSchema>;

export const listCoresQuerySchema = z.object({
  includeArchived: queryBooleanSchema,
});
export type ListCoresQuery = z.infer<typeof listCoresQuerySchema>;
