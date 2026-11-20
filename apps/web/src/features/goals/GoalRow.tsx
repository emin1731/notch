import type { GoalDto, LocalDate } from '@notch/shared';
import { CircleCheck, Flag } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ProgressBar } from '@/components/ProgressBar';
import { deadlineText } from '@/lib/deadline';
import { cn } from '@/lib/utils';

/** A goal on a core card: a tile, the title and deadline, and its progress; links to its page. */
export function GoalRow({
  goal,
  today,
  action,
}: {
  goal: GoalDto;
  today: LocalDate;
  /** E.g. an Unarchive button, beside the link. */
  action?: ReactNode;
}) {
  const deadline = deadlineText(goal.deadline, goal.status, today);
  const completed = goal.status === 'COMPLETED';
  const Icon = completed ? CircleCheck : Flag;
  return (
    <div className="flex items-center gap-2">
      <Link
        to={`/goals/${goal.id}`}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-4 rounded-2xl px-3 py-3 transition-colors hover:bg-muted/70',
          'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          goal.archivedAt && 'opacity-60',
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon
            className="size-5"
            aria-label={completed ? 'Completed' : undefined}
            aria-hidden={!completed}
          />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
              {goal.title}
            </span>
            {deadline && (
              <span
                className={cn(
                  'shrink-0 text-xs',
                  deadline.overdue ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
                )}
              >
                {deadline.text}
              </span>
            )}
          </span>
          {!completed &&
            (goal.milestoneCounts.total > 0 ? (
              <ProgressBar
                done={goal.milestoneCounts.done}
                total={goal.milestoneCounts.total}
                label={goal.title}
              />
            ) : (
              <span className="text-sm text-muted-foreground">No milestones yet</span>
            ))}
        </span>
      </Link>
      {action}
    </div>
  );
}
