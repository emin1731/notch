import { type TodayHabit, UNDO_BLOCK_REASON_TEXT } from '@notch/shared';
import { Lock, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useUndoChange } from '@/features/review/hooks';
import {
  changeArrow,
  changeValues,
  movedText,
  reasonForKind,
  undoneMessage,
} from '@/lib/change-format';
import { cn } from '@/lib/utils';

/**
 * "↑ 50 → 55 min" on a habit whose target moved this week (plan 2.8). The popover says why, and
 * offers Undo while the API allows it, or explains why not.
 */
export function TargetChangeBadge({ habit }: { habit: TodayHabit }) {
  const undo = useUndoChange();
  const change = habit.change;
  if (!change) {
    return null;
  }
  const up = change.kind === 'LEVEL_UP';
  const values = changeValues(change, habit);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${up ? 'Levelled up' : 'Eased off'}: ${values}`}
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring',
            up
              ? 'bg-(--core)/15 text-(--core) hover:bg-(--core)/25'
              : 'bg-muted text-muted-foreground hover:bg-muted/70',
          )}
        >
          {changeArrow(change.kind)} {values}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <PopoverHeader>
          <PopoverTitle>{reasonForKind(change.kind)}</PopoverTitle>
          <PopoverDescription>
            {movedText(change, habit)}
            {!up && " This isn't a step back."}
          </PopoverDescription>
        </PopoverHeader>
        {change.canUndo ? (
          <Button
            variant="outline"
            size="sm"
            className="mt-3 self-start"
            disabled={undo.isPending}
            onClick={() => undo.mutate({ changeId: change.id, done: undoneMessage(change, habit) })}
          >
            <Undo2 />
            Undo
          </Button>
        ) : (
          change.undoBlockedReason && (
            <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {UNDO_BLOCK_REASON_TEXT[change.undoBlockedReason]}.
            </p>
          )
        )}
      </PopoverContent>
    </Popover>
  );
}
