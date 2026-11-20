import { Timer } from 'lucide-react';
import { Link } from 'react-router';
import { formatClock, useElapsed, useTimer } from '@/features/today/timer';
import { useToday } from '@/lib/use-today';
import { cn } from '@/lib/utils';

/** The running timer, visible from every page; it links to the day it's logging to. */
export function TimerIndicator({ className }: { className?: string }) {
  const running = useTimer((state) => state.running);
  const elapsed = useElapsed(running?.startedAt);
  const today = useToday();
  if (!running) {
    return null;
  }
  return (
    <Link
      to={running.date === today ? '/today' : `/today?date=${running.date}`}
      className={cn(
        'flex h-11 min-w-0 items-center gap-2 rounded-full bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-card/70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
      aria-label={`Timer running: ${running.habitName}, ${formatClock(elapsed)}`}
    >
      <Timer className="size-4 shrink-0 animate-pulse" aria-hidden="true" />
      <span className="truncate">{running.habitName}</span>
      <span className="ml-auto tabular-nums">{formatClock(elapsed)}</span>
    </Link>
  );
}
