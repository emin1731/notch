import { type LocalDate, todayIn } from '@notch/shared';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { create } from 'zustand';
import { useAuth } from '@/features/auth/auth-context';
import { formatDuration } from '@/lib/habit-format';
import { currentValue } from './log-sync';
import { useLogSync } from './log-sync-context';
import { decideStop, type RunningTimer, useTimer } from './timer';
import { earliestDate, weekdayName } from './today-model';

export type TimerPrompt =
  | { kind: 'switch'; current: RunningTimer; next: RunningTimer }
  | { kind: 'too-long'; timer: RunningTimer; seconds: number }
  | { kind: 'outside-window'; timer: RunningTimer; seconds: number };

export const useTimerPrompt = create<{
  prompt: TimerPrompt | null;
  setPrompt: (prompt: TimerPrompt | null) => void;
}>()((set) => ({ prompt: null, setPrompt: (prompt) => set({ prompt }) }));

/** Starting and stopping the duration timer, and answering its prompts. */
export function useTimerActions() {
  const sync = useLogSync();
  const client = useQueryClient();
  const { user } = useAuth();
  const setPrompt = useTimerPrompt((state) => state.setPrompt);
  const today = () => todayIn(user?.timezone ?? 'UTC', new Date());

  /** Logs `seconds` to `date` and, if it's this timer, stops it. */
  const log = (timer: RunningTimer, date: LocalDate, seconds: number) => {
    if (useTimer.getState().running?.startedAt === timer.startedAt) {
      useTimer.getState().clear();
    }
    if (seconds <= 0) {
      return;
    }
    const habit = {
      id: timer.habitId,
      type: 'DURATION' as const,
      value: currentValue(client, date, timer.habitId),
    };
    void sync.increment(date, habit, seconds);
    if (date !== today()) {
      toast(`Logged ${formatDuration(seconds)} to ${weekdayName(date)}, when the timer started.`);
    }
  };

  const stop = (timer: RunningTimer) => {
    const decision = decideStop(timer, Date.now(), earliestDate(today()));
    switch (decision.kind) {
      case 'nothing':
        useTimer.getState().clear();
        return;
      case 'log':
        log(timer, decision.date, decision.seconds);
        return;
      default:
        setPrompt({ ...decision, timer });
    }
  };

  return {
    start(habit: { id: string; name: string }, date: LocalDate) {
      const next: RunningTimer = {
        habitId: habit.id,
        habitName: habit.name,
        date,
        startedAt: Date.now(),
      };
      const current = useTimer.getState().running;
      if (current && current.habitId !== habit.id) {
        setPrompt({ kind: 'switch', current, next });
        return;
      }
      if (!current) {
        useTimer.getState().start(next);
      }
    },
    stop() {
      const timer = useTimer.getState().running;
      if (timer) {
        stop(timer);
      }
    },
    /** "Stop X and start Y": X is stopped as usual (it may ask too), then Y starts. */
    switchTimers(prompt: Extract<TimerPrompt, { kind: 'switch' }>) {
      setPrompt(null);
      stop(prompt.current);
      useTimer.getState().start({ ...prompt.next, startedAt: Date.now() });
    },
    /** Logs the (possibly edited) time of a long or out-of-window timer. */
    logPrompted(
      prompt: Exclude<TimerPrompt, { kind: 'switch' }>,
      seconds: number,
      date: LocalDate,
    ) {
      setPrompt(null);
      log(prompt.timer, date, seconds);
    },
    discard(prompt: Exclude<TimerPrompt, { kind: 'switch' }>) {
      setPrompt(null);
      if (useTimer.getState().running?.startedAt === prompt.timer.startedAt) {
        useTimer.getState().clear();
      }
    },
    dismiss: () => setPrompt(null),
    today,
  };
}
