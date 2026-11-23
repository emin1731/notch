import { z } from 'zod';
import { daysBetween } from '../dates/week.js';
import { type LocalDate, localDateSchema } from '../dates/local-date.js';
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

/** Why `from` … `to` isn't a valid log range, or null. The API checks it again once `to` defaults. */
export function logRangeIssue(from: LocalDate, to: LocalDate): string | null {
  if (from > to) {
    return '`from` is after `to`';
  }
  if (daysBetween(from, to) >= LOG_RANGE_MAX_DAYS) {
    return `At most ${LOG_RANGE_MAX_DAYS} days`;
  }
  return null;
}

export const logRangeQuerySchema = z
  .object({ from: localDateSchema.optional(), to: localDateSchema.optional() })
  .superRefine(({ from, to }, ctx) => {
    const message = from && to ? logRangeIssue(from, to) : null;
    if (message) {
      ctx.addIssue({ code: 'custom', message });
    }
  });
export type LogRangeQuery = z.infer<typeof logRangeQuerySchema>;

export const todayQuerySchema = z.object({ date: localDateSchema.optional() });
export type TodayQuery = z.infer<typeof todayQuerySchema>;
