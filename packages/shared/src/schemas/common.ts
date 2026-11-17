import { z } from 'zod';
import { LIMITS } from '../constants.js';

export const uuidSchema = z.uuid();

/** Query-string booleans: "true" / "false", absent → false. */
export const queryBooleanSchema = z.stringbool().default(false);

/** `{ ids }` for the reorder endpoints: unique, at most 200. */
export const idsOrderSchema = z.object({
  ids: z
    .array(uuidSchema)
    .min(1)
    .max(LIMITS.orderIds)
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Ids must be unique' }),
});
export type IdsOrderInput = z.infer<typeof idsOrderSchema>;
