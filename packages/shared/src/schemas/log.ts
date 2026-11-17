import { z } from 'zod';
import { daysBetween } from '../dates/week.js';
import { localDateSchema } from '../dates/local-date.js';
import { LOG_LIMITS } from '../progress/progress.js';

const MAX_VALUE = Math.max(...Object.values(LOG_LIMITS));

/** The habit type's own cap (`maxLogValue`) is checked by the API. 0 deletes the log. */
export const setLogSchema = z.object({ value: z.number().int().min(0).max(MAX_VALUE) });
export type SetLogInput = z.infer<typeof setLogSchema>;

/** Counter buttons and the timer. The result is clamped to 0 … the type's cap. */
export const incrementLogSchema = z.object({
  delta: z
    .number()
    .int()
    .min(-MAX_VALUE)
    .max(MAX_VALUE)
    .refine((delta) => delta !== 0, { message: 'Must not be 0' }),
});
export type IncrementLogInput = z.infer<typeof incrementLogSchema>;

export const LOG_RANGE_MAX_DAYS = 366;

export const logRangeQuerySchema = z
  .object({ from: localDateSchema.optional(), to: localDateSchema.optional() })
  .refine(({ from, to }) => !from || !to || from <= to, { message: '`from` is after `to`' })
  .refine(({ from, to }) => !from || !to || daysBetween(from, to) < LOG_RANGE_MAX_DAYS, {
    message: `At most ${LOG_RANGE_MAX_DAYS} days`,
  });
export type LogRangeQuery = z.infer<typeof logRangeQuerySchema>;

export const todayQuerySchema = z.object({ date: localDateSchema.optional() });
export type TodayQuery = z.infer<typeof todayQuerySchema>;
