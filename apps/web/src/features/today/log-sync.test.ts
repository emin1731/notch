import type { TodayResponse } from '@notch/shared';
import { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, setCsrfCookie } from '@/test/auth';
import { mockTodayApi, todayHabit } from '@/test/today-api';
import { queryKeys } from '@/lib/query-keys';
import { createLogSync, TAP_DEBOUNCE_MS, useOverrides } from './log-sync';
import { applyOverrides, overrideKey } from './today-model';

const date = '2026-11-19';

function setup(options: { writeDelayMs?: number } = {}) {
  const water = todayHabit({ name: 'Water', type: 'COUNT', target: 8, unit: 'glasses' });
  const api = mockTodayApi([water], { date, ...options });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const day: TodayResponse = {
    date,
    dayProgress: 0,
    pendingReview: null,
    welcomeBack: false,
    groups: [{ timeOfDay: 'ANYTIME', habits: [water] }],
    weeklyQuota: [],
  };
  client.setQueryData(queryKeys.today.date(date), day);
  const sync = createLogSync(client);
  /** What the page shows for Water: the cache with any unsaved value on top. */
  const shown = () => {
    const today = client.getQueryData<TodayResponse>(queryKeys.today.date(date))!;
    return applyOverrides(today, useOverrides.getState().values).groups[0]!.habits[0]!;
  };
  const tap = (delta: number) =>
    sync.tap(date, { id: water.id, type: 'COUNT', value: shown().log?.value ?? 0 }, delta);
  const cached = () =>
    client.getQueryData<TodayResponse>(queryKeys.today.date(date))!.groups[0]!.habits[0]!;
  return { api, client, sync, water, shown, tap, cached };
}

describe('log sync', () => {
  beforeEach(() => {
    setCsrfCookie();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('shows taps at once and sends them as one summed increment', async () => {
    const { api, sync, water, shown, tap, cached } = setup();

    tap(1);
    tap(1);
    tap(1);
    expect(shown().log?.value).toBe(3);
    expect(shown().progress).toBe(3 / 8);
    expect(api.writes()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(TAP_DEBOUNCE_MS);
    await vi.waitFor(() => expect(sync.isBusy(date, water.id)).toBe(false));

    expect(api.writes()).toEqual([
      expect.objectContaining({ method: 'INCREMENT', body: { delta: 3 } }),
    ]);
    // Saved: the server's value is in the cache and the override is gone.
    expect(cached().log?.value).toBe(3);
    expect(useOverrides.getState().values[overrideKey(date, water.id)]).toBeUndefined();
  });

  it('keeps showing new taps while an earlier increment is answered, then takes the final result', async () => {
    const { api, sync, water, shown, tap, cached } = setup({ writeDelayMs: 50 });
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true });

    tap(1);
    tap(1);
    await vi.advanceTimersByTimeAsync(TAP_DEBOUNCE_MS); // sends +2; its answer takes 50 ms
    tap(1);
    expect(shown().log?.value).toBe(3);
    await vi.advanceTimersByTimeAsync(60); // +2 answered: 2 on the server, but a tap is unsent
    expect(shown().log?.value).toBe(3);
    expect(cached().log).toBeNull();

    await vi.advanceTimersByTimeAsync(TAP_DEBOUNCE_MS + 60);
    await vi.waitFor(() => expect(sync.isBusy(date, water.id)).toBe(false));
    expect(api.writes().map((call) => call.body)).toEqual([{ delta: 2 }, { delta: 1 }]);
    expect(cached().log?.value).toBe(3);
    expect(shown().log?.value).toBe(3);
  });

  it('falls back to the saved value with a toast when a write fails', async () => {
    const { api, sync, water, shown, tap } = setup();
    api.failNext('INCREMENT', () => apiError(500, 'INTERNAL'));
    const error = vi.spyOn(toast, 'error');

    tap(1);
    tap(1);
    await vi.advanceTimersByTimeAsync(TAP_DEBOUNCE_MS);
    await vi.waitFor(() => expect(sync.isBusy(date, water.id)).toBe(false));

    expect(shown().log).toBeNull();
    expect(error).toHaveBeenCalledWith("Couldn't save that. Check your connection and try again.");
  });

  it('sends a typed value after earlier taps, in order, dropping taps not yet sent', async () => {
    const { api, sync, water, shown, tap, cached } = setup();

    tap(1);
    await vi.advanceTimersByTimeAsync(TAP_DEBOUNCE_MS); // +1 sent
    tap(1); // not sent yet…
    sync.set(date, { id: water.id, type: 'COUNT', value: shown().log?.value ?? 0 }, 6); // …replaced
    expect(shown().log?.value).toBe(6);
    await vi.advanceTimersByTimeAsync(TAP_DEBOUNCE_MS);
    await vi.waitFor(() => expect(sync.isBusy(date, water.id)).toBe(false));

    expect(api.writes().map((call) => [call.method, call.body])).toEqual([
      ['INCREMENT', { delta: 1 }],
      ['PUT', { value: 6 }],
    ]);
    expect(cached().log?.value).toBe(6);
  });

  it('never goes below zero, and a tap that changes nothing sends nothing', async () => {
    const { api, tap, shown } = setup();
    tap(-1);
    await vi.advanceTimersByTimeAsync(TAP_DEBOUNCE_MS);
    expect(shown().log).toBeNull();
    expect(api.writes()).toHaveLength(0);
  });

  it('flushes unsent taps right away when the page goes, with keepalive', async () => {
    const { api, sync, water, tap } = setup();
    const fetch = vi.spyOn(globalThis, 'fetch');
    tap(1);
    tap(1);
    sync.flush({ keepalive: true });
    await vi.waitFor(() => expect(sync.isBusy(date, water.id)).toBe(false));
    expect(api.writes()).toEqual([expect.objectContaining({ body: { delta: 2 } })]);
    // (Node's Request drops `keepalive` on the way to the mock, so check what fetch was given.)
    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: `/api/v1/habits/${water.id}/logs/${date}/increment` }),
      expect.objectContaining({ keepalive: true }),
    );
  });
});
