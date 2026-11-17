import { z } from 'zod';
import { STATS_RANGES } from '../stats/range.js';

export const statsQuerySchema = z.object({ range: z.enum(STATS_RANGES).default('30d') });
export type StatsQuery = z.infer<typeof statsQuerySchema>;
