import {
  type HabitType,
  type LocalDate,
  type LogWriteResult,
  maxLogValue,
  type TodayResponse,
} from '@notch/shared';
import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { create } from 'zustand';
import { apiErrorMessage, FALLBACK_FORM_MESSAGE } from '@/lib/forms';
import { invalidate, queryKeys } from '@/lib/query-keys';
import { logsApi } from './api';
import { allHabits, mergeWriteResult, type Overrides, overrideKey } from './today-model';

/** Counter taps within this long of each other go out as one increment. */
export const TAP_DEBOUNCE_MS = 400;

interface OverridesState {
  values: Overrides;
  set: (key: string, value: number) => void;
  drop: (key: string) => void;
  clear: () => void;
}

/** What each habit shows until its writes are saved (see `applyOverrides`). */
export const useOverrides = create<OverridesState>()((set) => ({
  values: {},
  set: (key, value) => set((state) => ({ values: { ...state.values, [key]: value } })),
  drop: (key) =>
    set((state) => {
      if (!(key in state.values)) {
        return state;
      }
      const { [key]: _dropped, ...rest } = state.values;
      return { values: rest };
    }),
  clear: () => set({ values: {} }),
}));

/** The habit a write is for: enough to clamp values and name it. */
export interface LogTarget {
  id: string;
  type: HabitType;
  /** The value showing now (with any unsaved change), or 0 without a log. */
  value: number;
}

interface Entry {
  date: LocalDate;
  habitId: string;
  /** Writes for one habit go out one after another, in order. */
  queue: Promise<void>;
  inflight: number;
  /** Counter taps not sent yet, and their debounce timer. */
  pendingDelta: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

export interface LogSync {
  /** Sets the day's value (a toggle, or a typed number), dropping any unsent taps. */
  set: (date: LocalDate, habit: LogTarget, value: number) => void;
  /** A counter tap: shown at once, sent with the next taps as one increment. */
  tap: (date: LocalDate, habit: LogTarget, delta: number) => void;
  /** Adds to the day's value now ("+ add time", the timer). */
  increment: (date: LocalDate, habit: LogTarget, delta: number) => Promise<void>;
  /** True while the habit has unsent or unanswered writes for the day. */
  isBusy: (date: LocalDate, habitId: string) => boolean;
  /** Sends every unsent tap now; `keepalive` when the page is going away. */
  flush: (options?: { keepalive?: boolean }) => void;
  /** Forgets everything unsent (logging out). */
  reset: () => void;
}

const SAVE_FAILED = "Couldn't save that. Check your connection and try again.";

/**
 * Logging that feels instant and stays correct (plan 7.3): values show at once through
 * `useOverrides`; writes per habit go out in order; while a habit has writes outstanding, nothing
 * from the server changes what it shows; once it's idle, the server's result is what stays.
 */
export function createLogSync(client: QueryClient): LogSync {
  const entries = new Map<string, Entry>();
  const overrides = () => useOverrides.getState();

  const entryFor = (date: LocalDate, habitId: string): Entry => {
    const key = overrideKey(date, habitId);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        date,
        habitId,
        queue: Promise.resolve(),
        inflight: 0,
        pendingDelta: 0,
        timer: undefined,
      };
      entries.set(key, entry);
    }
    return entry;
  };

  const idle = (entry: Entry) =>
    entry.inflight === 0 && entry.pendingDelta === 0 && entry.timer === undefined;

  const cancelTaps = (entry: Entry) => {
    clearTimeout(entry.timer);
    entry.timer = undefined;
    entry.pendingDelta = 0;
  };

  /** Shows `value` for the habit and keeps refetches from replacing it in the meantime. */
  const show = (entry: Entry, value: number) => {
    overrides().set(overrideKey(entry.date, entry.habitId), value);
    void client.cancelQueries({ queryKey: queryKeys.today.date(entry.date) });
  };

  const settle = (entry: Entry, result: LogWriteResult) => {
    if (!idle(entry)) {
      return; // A later write is coming; its result is the one that counts.
    }
    client.setQueryData<TodayResponse>(queryKeys.today.date(entry.date), (today) =>
      today ? mergeWriteResult(today, entry.habitId, result) : today,
    );
    overrides().drop(overrideKey(entry.date, entry.habitId));
    // The week's hits and the stats come from the server, quietly.
    void invalidate.logWrite(client, { date: entry.date, habitId: entry.habitId });
  };

  const fail = (entry: Entry, error: unknown) => {
    cancelTaps(entry);
    overrides().drop(overrideKey(entry.date, entry.habitId));
    void client.invalidateQueries({ queryKey: queryKeys.today.date(entry.date) });
    // Plan 14's "Error saving", unless the API said something more specific (an archived
    // habit, a day outside the window).
    const message = apiErrorMessage(error);
    toast.error(message === FALLBACK_FORM_MESSAGE ? SAVE_FAILED : message);
  };

  const enqueue = (entry: Entry, send: () => Promise<LogWriteResult>) => {
    entry.inflight += 1;
    entry.queue = entry.queue.then(async () => {
      try {
        const result = await send();
        entry.inflight -= 1;
        settle(entry, result);
      } catch (error) {
        entry.inflight -= 1;
        fail(entry, error);
      }
    });
    return entry.queue;
  };

  const sendTaps = (entry: Entry, keepalive = false) => {
    clearTimeout(entry.timer);
    entry.timer = undefined;
    const delta = entry.pendingDelta;
    entry.pendingDelta = 0;
    if (delta !== 0) {
      void enqueue(entry, () => logsApi.increment(entry.habitId, entry.date, delta, { keepalive }));
    }
  };

  const clamp = (habit: LogTarget, value: number) =>
    Math.min(Math.max(value, 0), maxLogValue(habit.type));

  return {
    set(date, habit, value) {
      const entry = entryFor(date, habit.id);
      cancelTaps(entry);
      const next = clamp(habit, value);
      show(entry, next);
      void enqueue(entry, () => logsApi.set(habit.id, date, next));
    },

    tap(date, habit, delta) {
      const entry = entryFor(date, habit.id);
      const next = clamp(habit, habit.value + delta);
      if (next === habit.value) {
        return;
      }
      entry.pendingDelta += next - habit.value;
      show(entry, next);
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => sendTaps(entry), TAP_DEBOUNCE_MS);
    },

    increment(date, habit, delta) {
      const entry = entryFor(date, habit.id);
      sendTaps(entry);
      const next = clamp(habit, habit.value + delta);
      show(entry, next);
      return enqueue(entry, () => logsApi.increment(habit.id, date, delta));
    },

    isBusy(date, habitId) {
      const entry = entries.get(overrideKey(date, habitId));
      return entry !== undefined && !idle(entry);
    },

    flush({ keepalive = false } = {}) {
      for (const entry of entries.values()) {
        if (entry.pendingDelta !== 0) {
          sendTaps(entry, keepalive);
        }
      }
    },

    reset() {
      for (const entry of entries.values()) {
        cancelTaps(entry);
      }
      entries.clear();
      overrides().clear();
    },
  };
}

/** The value a habit shows on a day right now, from the cache and any unsaved change. */
export function currentValue(client: QueryClient, date: LocalDate, habitId: string): number {
  const override = useOverrides.getState().values[overrideKey(date, habitId)];
  if (override !== undefined) {
    return override;
  }
  const today = client.getQueryData<TodayResponse>(queryKeys.today.date(date));
  return today ? (allHabits(today).find((habit) => habit.id === habitId)?.log?.value ?? 0) : 0;
}
