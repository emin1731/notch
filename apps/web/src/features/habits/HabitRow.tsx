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
    <div className={cn('flex items-center gap-1 rounded-2xl', archived && 'opacity-60')}>
      {handle}
      <Link
        to={`/habits/${habit.id}`}
        className="flex min-w-0 flex-1 items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[0.9375rem] font-medium">{habit.name}</span>
          <span className="truncate text-sm text-muted-foreground">{habitSummary(habit)}</span>
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
