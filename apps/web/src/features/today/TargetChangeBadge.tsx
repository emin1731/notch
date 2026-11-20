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
import { closingLine } from '@/features/review/copy';

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
            'h-7 shrink-0 rounded-full px-2.5 text-xs font-medium tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            up
              ? 'bg-primary text-primary-foreground hover:bg-primary/85'
              : 'bg-muted text-foreground hover:bg-accent',
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
            {` ${closingLine(change.kind)}`}
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
