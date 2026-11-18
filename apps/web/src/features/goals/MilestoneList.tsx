import {
  type GoalDetailDto,
  LIMITS,
  type MilestoneChangeResult,
  type MilestoneDto,
  milestoneTitleSchema,
} from '@notch/shared';
import { Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { toast } from 'sonner';
import { SortableList } from '@/components/SortableList';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldError } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { apiErrorMessage } from '@/lib/forms';
import { cn } from '@/lib/utils';
import {
  useAddMilestone,
  useDeleteMilestone,
  useRenameMilestone,
  useReorderMilestones,
  useToggleMilestone,
} from './hooks';

/**
 * A goal's milestones: tick, rename in place, reorder, delete, and add at the bottom.
 * `onGoalCompleted` fires when the server says a change completed the goal.
 */
export function MilestoneList({
  goal,
  onGoalCompleted,
}: {
  goal: GoalDetailDto;
  onGoalCompleted: () => void;
}) {
  const toggle = useToggleMilestone(goal.id);
  const remove = useDeleteMilestone(goal.id);
  const reorder = useReorderMilestones(goal.id);
  const readOnly = goal.archivedAt !== null;

  const celebrateIfDone = (result: { goalJustCompleted: boolean }) => {
    if (result.goalJustCompleted) {
      onGoalCompleted();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {goal.milestones.length > 0 && (
        <SortableList
          items={goal.milestones}
          getLabel={(milestone) => milestone.title}
          onReorder={(ids) => reorder.mutate(ids)}
          disabled={readOnly}
          className="flex flex-col gap-1"
          renderItem={(milestone, handle) => (
            <MilestoneRow
              milestone={milestone}
              goalId={goal.id}
              handle={handle}
              readOnly={readOnly}
              onToggle={() =>
                toggle.mutate(milestone.id, {
                  onSuccess: (result: MilestoneChangeResult) => celebrateIfDone(result),
                })
              }
              onDelete={() =>
                remove.mutate(milestone.id, {
                  onSuccess: celebrateIfDone,
                  onError: (error) => toast.error(apiErrorMessage(error)),
                })
              }
            />
          )}
        />
      )}
      {!readOnly && <AddMilestone goalId={goal.id} count={goal.milestones.length} />}
    </div>
  );
}

function MilestoneRow({
  milestone,
  goalId,
  handle,
  readOnly,
  onToggle,
  onDelete,
}: {
  milestone: MilestoneDto;
  goalId: string;
  handle: ReactNode;
  readOnly: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const rename = useRenameMilestone(goalId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(milestone.title);
  const done = milestone.completedAt !== null;

  const save = () => {
    setEditing(false);
    const parsed = milestoneTitleSchema.safeParse(draft);
    if (!parsed.success || parsed.data === milestone.title) {
      setDraft(milestone.title);
      return;
    }
    rename.mutate(
      { id: milestone.id, title: parsed.data },
      {
        onError: (error) => {
          setDraft(milestone.title);
          toast.error(`Couldn't rename that. ${apiErrorMessage(error)}`);
        },
      },
    );
  };

  return (
    <div className="group flex min-h-10 items-center gap-2 rounded-lg px-1 hover:bg-muted/50">
      {handle}
      <Checkbox
        checked={done}
        onCheckedChange={onToggle}
        disabled={readOnly}
        aria-label={milestone.title}
        className={cn(!handle && 'ml-2')}
      />
      {editing ? (
        <Input
          autoFocus
          aria-label="Milestone title"
          value={draft}
          maxLength={200}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              setDraft(milestone.title);
              setEditing(false);
            }
          }}
          className="h-7 flex-1"
        />
      ) : (
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setEditing(true)}
          aria-label={`Rename ${milestone.title}`}
          className={cn(
            'min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
            done && 'text-muted-foreground line-through',
          )}
        >
          {rename.isPending ? (rename.variables?.title ?? milestone.title) : milestone.title}
        </button>
      )}
      {!readOnly && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          aria-label={`Delete ${milestone.title}`}
          className="text-muted-foreground opacity-100 hover:text-destructive md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100"
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

function AddMilestone({ goalId, count }: { goalId: string; count: number }) {
  const add = useAddMilestone(goalId);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const errorId = useId();
  const full = count >= LIMITS.milestonesPerGoal;

  const submit = () => {
    const parsed = milestoneTitleSchema.safeParse(draft);
    if (!parsed.success) {
      setError(draft.trim() ? (parsed.error.issues[0]?.message ?? null) : null);
      return;
    }
    setError(null);
    add.mutate(parsed.data, {
      onSuccess: () => setDraft(''),
      onError: (caught) => setError(apiErrorMessage(caught)),
    });
  };

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-1"
    >
      <label htmlFor={inputId} className="sr-only">
        New milestone
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draft}
          disabled={full}
          placeholder={full ? 'This goal has the most milestones it can have' : 'Add a milestone'}
          onChange={(event) => setDraft(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <Button type="submit" variant="outline" disabled={full || add.isPending || !draft.trim()}>
          <Plus />
          Add
        </Button>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </form>
  );
}
