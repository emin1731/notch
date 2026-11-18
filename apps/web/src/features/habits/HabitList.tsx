import type { HabitDto } from '@notch/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SortableList } from '@/components/SortableList';
import { apiErrorMessage } from '@/lib/forms';
import { HabitRow } from './HabitRow';
import { useArchiveHabit, useDeleteHabit, useReorderHabits, useUpdateHabit } from './hooks';

/**
 * Habits with their actions (edit, archive, delete with a confirmation, and unlink on a goal).
 * `reorderable` lists them in a SortableList saved with `PUT /habits/order`.
 */
export function HabitList({
  habits,
  includeArchived,
  reorderable,
  unlinkable,
}: {
  habits: readonly HabitDto[];
  /** Which habits list the page shows, so a reorder updates the right one. */
  includeArchived: boolean;
  reorderable?: boolean;
  unlinkable?: boolean;
}) {
  const navigate = useNavigate();
  const archive = useArchiveHabit();
  const update = useUpdateHabit();
  const remove = useDeleteHabit();
  const reorder = useReorderHabits(includeArchived);
  const [deleting, setDeleting] = useState<HabitDto | null>(null);

  const run = (action: Promise<unknown>, done: string) =>
    action.then(
      () => toast.success(done),
      (error: unknown) => toast.error(apiErrorMessage(error)),
    );

  const row = (habit: HabitDto, handle?: React.ReactNode) => (
    <HabitRow
      habit={habit}
      handle={handle}
      actions={{
        onEdit: () => void navigate(`/habits/${habit.id}/edit`),
        onArchive: () =>
          void run(
            archive.mutateAsync({ id: habit.id, archive: true }),
            `${habit.name} is archived. It no longer shows on Today.`,
          ),
        onUnarchive: () =>
          void run(archive.mutateAsync({ id: habit.id, archive: false }), `${habit.name} is back.`),
        onDelete: () => setDeleting(habit),
        onUnlink: unlinkable
          ? () =>
              void run(
                update.mutateAsync({
                  id: habit.id,
                  input: { goalId: null },
                  previousGoalId: habit.goalId,
                }),
                `${habit.name} is no longer linked to this goal.`,
              )
          : undefined,
      }}
    />
  );

  return (
    <>
      {reorderable ? (
        <SortableList
          items={habits}
          getLabel={(habit) => habit.name}
          onReorder={(ids) => reorder.mutate(ids)}
          renderItem={row}
          className="flex flex-col gap-0.5"
        />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {habits.map((habit) => (
            <li key={habit.id}>{row(habit)}</li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'habit'}?`}
        description="This deletes its logs and level history. It can't be undone. To stop it without losing anything, archive it instead."
        confirmLabel="Delete habit"
        destructive
        onConfirm={() => (deleting ? remove.mutateAsync(deleting) : Promise.resolve())}
      />
    </>
  );
}
