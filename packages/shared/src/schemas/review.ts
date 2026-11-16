import { z } from 'zod';
import { localDateSchema } from '../dates/local-date.js';

export const listReviewsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(52).default(10),
  /** Returns reviews of weeks before this one. */
  cursor: localDateSchema.optional(),
});
export type ListReviewsQuery = z.infer<typeof listReviewsQuerySchema>;
