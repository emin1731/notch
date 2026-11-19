import type { HabitDto, HabitType } from '@notch/shared';
import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  Hash,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  Timer,
  Trash2,
  Unlink,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { habitSummary } from '@/lib/habit-format';
import { cn } from '@/lib/utils';

export const HABIT_TYPE_ICONS: Record<HabitType, LucideIcon> = {
  TOGGLE: CircleCheck,
  COUNT: Hash,
  DURATION: Timer,
};

export interface HabitRowActions {
  onEdit: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  /** Only on a goal's page. */
  onUnlink?: () => void;
}

/** A habit in a list: what it is and when, linking to its page, with its actions. */
export function HabitRow({
  habit,
  handle,
  actions,
}: {
  habit: HabitDto;
  handle?: ReactNode;
  actions: HabitRowActions;
}) {
  const Icon = HABIT_TYPE_ICONS[habit.type];
  const archived = habit.archivedAt !== null;
  return (
    <div className={cn('flex items-center gap-1 rounded-lg', archived && 'opacity-60')}>
      {handle}
      <Link
        to={`/habits/${habit.id}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{habit.name}</span>
          <span className="truncate text-xs text-muted-foreground">{habitSummary(habit)}</span>
        </span>
      </Link>
      {archived && <Badge variant="secondary">Archived</Badge>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`${habit.name} actions`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={actions.onEdit}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          {actions.onUnlink && (
            <DropdownMenuItem onSelect={actions.onUnlink}>
              <Unlink />
              Unlink from goal
            </DropdownMenuItem>
          )}
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
    </div>
  );
}
