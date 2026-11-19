import type { LocalDate } from '@notch/shared';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** The one running duration timer (plan 7.4), kept in localStorage so it survives a reload. */
export interface RunningTimer {
  habitId: string;
  habitName: string;
  /** The day it was started for: the time is credited there. */
  date: LocalDate;
  /** Epoch milliseconds. */
  startedAt: number;
}

interface TimerState {
  running: RunningTimer | null;
  start: (timer: RunningTimer) => void;
  clear: () => void;
}

export const TIMER_STORAGE_KEY = 'notch-timer';

export const useTimer = create<TimerState>()(
  persist(
    (set) => ({
      running: null,
      start: (timer) => set({ running: timer }),
      clear: () => set({ running: null }),
    }),
    {
      name: TIMER_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ running: state.running }),
    },
  ),
);

/** Over this long, stopping asks "Still going?" before logging. */
export const LONG_TIMER_SECONDS = 6 * 60 * 60;

/** Whole seconds between `startedAt` and `now` (never negative). */
export const elapsedSeconds = (startedAt: number, now: number) =>
  Math.max(0, Math.floor((now - startedAt) / 1000));

/** "4:05", "12:34", "1:02:03". */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** Seconds since `startedAt`, updated every second. */
export function useElapsed(startedAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === undefined) {
      return;
    }
    // Ticks from the next second; until then the clamp in `elapsedSeconds` shows 0:00.
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  return startedAt === undefined ? 0 : elapsedSeconds(startedAt, now);
}

export type StopDecision =
  | { kind: 'nothing' }
  | { kind: 'log'; date: LocalDate; seconds: number }
  | { kind: 'too-long'; date: LocalDate; seconds: number }
  | { kind: 'outside-window'; seconds: number };

/**
 * What stopping does (plan 7.4): the time goes to the day the timer started; over 6 hours it asks
 * first; a start day already outside the backfill window asks where it should go.
 */
export function decideStop(timer: RunningTimer, now: number, earliest: LocalDate): StopDecision {
  const seconds = elapsedSeconds(timer.startedAt, now);
  if (seconds === 0) {
    return { kind: 'nothing' };
  }
  if (timer.date < earliest) {
    return { kind: 'outside-window', seconds };
  }
  if (seconds > LONG_TIMER_SECONDS) {
    return { kind: 'too-long', date: timer.date, seconds };
  }
  return { kind: 'log', date: timer.date, seconds };
}
