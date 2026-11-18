import type { CoreColor, GoalDto, LocalDate } from '@notch/shared';
import { CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ProgressBar } from '@/components/ProgressBar';
import { deadlineText } from '@/lib/deadline';
import { cn } from '@/lib/utils';

/** A goal on a core card: title, deadline and progress, linking to its page. */
export function GoalRow({
  goal,
  color,
  today,
  action,
}: {
  goal: GoalDto;
  color: CoreColor;
  today: LocalDate;
  /** E.g. an Unarchive button, beside the link. */
  action?: ReactNode;
}) {
  const deadline = deadlineText(goal.deadline, goal.status, today);
  const completed = goal.status === 'COMPLETED';
  return (
    <div className="flex items-start gap-2">
      <Link
        to={`/goals/${goal.id}`}
        className={cn(
          'flex min-w-0 flex-1 flex-col gap-1.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60',
          'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          goal.archivedAt && 'opacity-60',
        )}
      >
        <span className="flex items-center gap-2">
          {completed && (
            <CircleCheck className="size-4 shrink-0 text-(--core)" aria-label="Completed" />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{goal.title}</span>
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
              color={color}
              label={goal.title}
            />
          ) : (
            <span className="text-xs text-muted-foreground">No milestones yet</span>
          ))}
      </Link>
      {action && <div className="pt-1.5">{action}</div>}
    </div>
  );
}
