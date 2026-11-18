import type { CoreColor } from '@notch/shared';
import { coreStyle } from '@/lib/core-colors';
import { cn } from '@/lib/utils';

/** A goal's milestone progress in its core's color, e.g. "2 / 4 milestones". */
export function ProgressBar({
  done,
  total,
  color,
  label,
  className,
}: {
  done: number;
  total: number;
  color: CoreColor;
  /** What the bar measures, for screen readers, e.g. the goal's title. */
  label: string;
  className?: string;
}) {
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const text = `${done} / ${total} ${total === 1 ? 'milestone' : 'milestones'}`;
  return (
    <div className={cn('flex items-center gap-3', className)} style={coreStyle(color)}>
      <div
        role="progressbar"
        aria-label={`${label} progress`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={text}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-(--core) transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{text}</span>
    </div>
  );
}
