import type { GoalDetailDto, HabitDto } from '@notch/shared';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/forms';
import { habitSummary } from '@/lib/habit-format';
import { HABIT_TYPE_ICONS } from './HabitRow';
import { useUpdateHabit } from './hooks';

/** Links one of the core's habits that has no goal yet to this goal. */
export function LinkHabitDialog({
  open,
  onOpenChange,
  goal,
  habits,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: GoalDetailDto;
  /** All the user's habits; the dialog offers the core's active ones without a goal. */
  habits: readonly HabitDto[];
}) {
  const update = useUpdateHabit();
  const candidates = habits.filter(
    (habit) => habit.coreId === goal.coreId && habit.goalId === null && !habit.archivedAt,
  );

  const link = async (habit: HabitDto) => {
    try {
      await update.mutateAsync({ id: habit.id, input: { goalId: goal.id }, previousGoalId: null });
      toast.success(`${habit.name} is linked to ${goal.title}.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Link a habit</DialogTitle>
          <DialogDescription>
            Habits in this goal's core that aren't linked to a goal yet.
          </DialogDescription>
        </DialogHeader>
        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            There are none: every habit in this core already has a goal. Add a new one instead.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {candidates.map((habit) => {
              const Icon = HABIT_TYPE_ICONS[habit.type];
              return (
                <li
                  key={habit.id}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{habit.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {habitSummary(habit)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={update.isPending}
                    onClick={() => void link(habit)}
                    aria-label={`Link ${habit.name}`}
                  >
                    <Link2 />
                    Link
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
