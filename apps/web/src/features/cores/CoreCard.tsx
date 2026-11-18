import type { CoreDto, GoalDto, HabitDto, LocalDate } from '@notch/shared';
import {
  Archive,
  ArchiveRestore,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { Link } from 'react-router';
import { CoreIcon } from '@/components/CoreIcon';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GoalRow } from '@/features/goals/GoalRow';
import { HabitList } from '@/features/habits/HabitList';
import { coreStyle } from '@/lib/core-colors';
import { cn } from '@/lib/utils';

export interface CoreCardActions {
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onAddGoal: () => void;
  onUnarchiveGoal: (goal: GoalDto) => void;
}

/** A core with its goals: active ones first, then completed and archived ones folded away. */
export function CoreCard({
  core,
  goals,
  habits,
  includeArchived,
  today,
  handle,
  actions,
}: {
  core: CoreDto;
  goals: readonly GoalDto[];
  /** The core's habits that aren't linked to a goal (linked ones show on their goal's page). */
  habits: readonly HabitDto[];
  /** Whether the page shows archived items: the habits list a reorder updates. */
  includeArchived: boolean;
  today: LocalDate;
  /** The drag handle from SortableList. */
  handle?: ReactNode;
  actions: CoreCardActions;
}) {
  const titleId = useId();
  const archived = core.archivedAt !== null;
  const active = goals.filter((goal) => !goal.archivedAt && goal.status === 'ACTIVE');
  const completed = goals.filter((goal) => !goal.archivedAt && goal.status === 'COMPLETED');
  const archivedGoals = goals.filter((goal) => goal.archivedAt);

  return (
    <article
      aria-labelledby={titleId}
      style={coreStyle(core.color)}
      className={cn(
        'overflow-hidden rounded-xl border border-l-4 border-l-(--core) bg-card text-card-foreground',
        archived && 'border-dashed border-l-muted-foreground/40',
      )}
    >
      <header className="flex items-center gap-2 py-3 pr-2 pl-2">
        {handle}
        <CoreIcon icon={core.icon} color={core.color} className={cn(!handle && 'ml-2')} />
        <h2 id={titleId} className="min-w-0 flex-1 truncate font-medium">
          {core.name}
        </h2>
        {archived && <Badge variant="secondary">Archived</Badge>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${core.name} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={actions.onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            {archived ? (
              <DropdownMenuItem onSelect={actions.onUnarchive}>
                <ArchiveRestore />
                Unarchive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={actions.onArchive}>
                <Archive />
                Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={actions.onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="flex flex-col gap-1 px-2 pb-3">
        {active.length === 0 && completed.length === 0 && habits.length === 0 && !archived && (
          <p className="px-2 py-1 text-sm text-muted-foreground">No goals or habits yet.</p>
        )}
        {active.map((goal) => (
          <GoalRow key={goal.id} goal={goal} color={core.color} today={today} />
        ))}
        <Folded label="Completed" goals={completed}>
          {(goal) => <GoalRow key={goal.id} goal={goal} color={core.color} today={today} />}
        </Folded>
        <Folded label="Archived" goals={archivedGoals}>
          {(goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              color={core.color}
              today={today}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => actions.onUnarchiveGoal(goal)}
                  aria-label={`Unarchive ${goal.title}`}
                >
                  Unarchive
                </Button>
              }
            />
          )}
        </Folded>
        {habits.length > 0 && (
          <section aria-label={`${core.name} habits`} className="mt-2 flex flex-col gap-0.5">
            <h3 className="px-2 pb-1 text-xs font-medium text-muted-foreground">Habits</h3>
            <HabitList
              habits={habits}
              includeArchived={includeArchived}
              reorderable={!archived && habits.length > 1}
            />
          </section>
        )}
        {!archived && (
          <div className="mt-1 flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={actions.onAddGoal}
            >
              <Plus />
              Add goal
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
              <Link to={`/habits/new?coreId=${core.id}`}>
                <Plus />
                Add habit
              </Link>
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

/** "Completed (2)": a disclosure that keeps finished or archived goals out of the way. */
function Folded({
  label,
  goals,
  children,
}: {
  label: string;
  goals: readonly GoalDto[];
  children: (goal: GoalDto) => ReactNode;
}) {
  if (goals.length === 0) {
    return null;
  }
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-3.5 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        {label} ({goals.length})
      </summary>
      <div className="mt-1 flex flex-col gap-1">{goals.map((goal) => children(goal))}</div>
    </details>
  );
}
