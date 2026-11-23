import type { CoreDto, HabitDto } from '@notch/shared';
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useId } from 'react';
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
import { HabitList } from '@/features/habits/HabitList';
import { cn } from '@/lib/utils';

export interface CoreCardActions {
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onAddHabit: () => void;
}

/** A core with its habits. */
export function CoreCard({
  core,
  habits,
  includeArchived,
  handle,
  actions,
}: {
  core: CoreDto;
  habits: readonly HabitDto[];
  /** Whether the page shows archived items: the habits list a reorder updates. */
  includeArchived: boolean;
  /** The drag handle from SortableList. */
  handle?: ReactNode;
  actions: CoreCardActions;
}) {
  const titleId = useId();
  const archived = core.archivedAt !== null;

  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'overflow-hidden rounded-3xl bg-card text-card-foreground',
        archived && 'opacity-75',
      )}
    >
      <header className="flex items-center gap-3 px-3 pt-3 pb-1 sm:px-4 sm:pt-4">
        {handle}
        <CoreIcon icon={core.icon} color={core.color} size="lg" className={cn(!handle && 'ml-1')} />
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
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

      <div className="flex flex-col gap-0.5 px-1 pb-3 sm:px-2 sm:pb-4">
        {habits.length === 0 && !archived && (
          <p className="px-3 py-2 text-sm text-muted-foreground">No habits yet.</p>
        )}
        {habits.length > 0 && (
          <section aria-label={`${core.name} habits`}>
            <HabitList
              habits={habits}
              includeArchived={includeArchived}
              reorderable={!archived && habits.length > 1}
            />
          </section>
        )}
        {!archived && (
          <div className="mt-2 flex flex-wrap gap-2 px-2">
            <Button variant="secondary" size="sm" onClick={actions.onAddHabit}>
              <Plus />
              Add habit
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}
