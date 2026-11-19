import type { LocalDate, LogWriteResult, TodayResponse } from '@notch/shared';
import { api, type RequestOptions } from '@/lib/api-client';

export const todayApi = {
  get: (date: LocalDate) => api.get<TodayResponse>('/today', { query: { date } }),
};

export const logsApi = {
  /** Sets the day's value; 0 deletes the log. */
  set: (habitId: string, date: LocalDate, value: number) =>
    api.put<LogWriteResult>(`/habits/${habitId}/logs/${date}`, { value }),
  /** Adds to the day's value, clamped to 0 … the type's cap. */
  increment: (habitId: string, date: LocalDate, delta: number, options?: RequestOptions) =>
    api.post<LogWriteResult>(`/habits/${habitId}/logs/${date}/increment`, { delta }, options),
};
