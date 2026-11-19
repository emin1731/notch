import type { GoalDto } from '@notch/shared';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CircleCheck,
  Link2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  SearchX,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CoreChip } from '@/components/CoreChip';
import { EmptyState } from '@/components/EmptyState';
import { ProgressBar } from '@/components/ProgressBar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { useCores } from '@/features/cores/hooks';
import { HabitList } from '@/features/habits/HabitList';
import { useHabits } from '@/features/habits/hooks';
import { LinkHabitDialog } from '@/features/habits/LinkHabitDialog';
import { isApiError } from '@/lib/api-client';
import { deadlineText, formatLocalDate } from '@/lib/deadline';
import { apiErrorMessage } from '@/lib/forms';
import { useToday } from '@/lib/use-today';
import { cn } from '@/lib/utils';
import { CelebrationModal } from './CelebrationModal';
import { GoalDialog } from './GoalDialog';
import { useDeleteGoal, useGoal, useGoalAction } from './hooks';
import { MilestoneList } from './MilestoneList';

type Dialog = 'edit' | 'delete' | 'new-goal' | 'link' | null;

export default function GoalPage() {
  const { goalId = '' } = useParams();
  const navigate = useNavigate();
  const goal = useGoal(goalId);
  // Archived cores too: an archived goal may belong to one.
  const cores = useCores(true);
  // Archived ones too: the goal's archived habits still belong to it.
  const habits = useHabits(true);
  const today = useToday();
  const action = useGoalAction();
  const remove = useDeleteGoal();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [celebrating, setCelebrating] = useState(false);

  if (goal.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading goal">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (goal.isError) {
    const missing = isApiError(goal.error) && [400, 404].includes(goal.error.status);
    return (
      <EmptyState
        icon={missing ? SearchX : TriangleAlert}
        title={missing ? 'Goal not found' : "Couldn't load this goal"}
        action={
          missing ? (
            <Button asChild variant="outline">
              <Link to="/cores">Back to Cores & Goals</Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void goal.refetch()}>
              Try again
            </Button>
          )
        }
      >
        {missing
          ? 'It may have been deleted, or the link is wrong.'
          : 'Check your connection and try again.'}
      </EmptyState>
    );
  }

  const data = goal.data;
  const core = cores.data?.find((candidate) => candidate.id === data.coreId);
  const color = core?.color ?? 'slate';
  const archived = data.archivedAt !== null;
  const completed = data.status === 'COMPLETED';
  const deadline = deadlineText(data.deadline, data.status, today);
  const hasMilestones = data.milestones.length > 0;
  const linkedHabits = (habits.data ?? []).filter((habit) => habit.goalId === data.id);

  const run = (
    kind: 'complete' | 'reopen' | 'archive' | 'unarchive',
    onDone?: (goal: GoalDto) => void,
  ) =>
    action.mutate(
      { id: data.id, action: kind },
      { onSuccess: onDone, onError: (error) => toast.error(apiErrorMessage(error)) },
    );

  return (
    <>
      <Link
        to="/cores"
        className="mb-4 inline-flex items-center gap-1 rounded text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Cores & Goals
      </Link>

      <header className="mb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          {core ? <CoreChip name={core.name} icon={core.icon} color={core.color} /> : <span />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Goal actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setDialog('edit')} disabled={archived}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              {archived ? (
                <DropdownMenuItem onSelect={() => run('unarchive')}>
                  <ArchiveRestore />
                  Unarchive
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => run('archive')}>
                  <Archive />
                  Archive
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{data.title}</h1>
          {archived ? (
            <Badge variant="secondary">Archived</Badge>
          ) : completed ? (
            <Badge variant="outline">
              <CircleCheck />
              Completed
            </Badge>
          ) : null}
        </div>

        {data.description && (
          <p className="text-sm whitespace-pre-line text-muted-foreground">{data.description}</p>
        )}

        {data.deadline && (
          <p className="text-sm text-muted-foreground">
            Deadline {formatLocalDate(data.deadline)}
            {deadline && (
              <>
                {' · '}
                <span className={cn(deadline.overdue && 'text-amber-700 dark:text-amber-400')}>
                  {deadline.text}
                </span>
              </>
            )}
          </p>
        )}

        {hasMilestones && (
          <ProgressBar
            done={data.milestoneCounts.done}
            total={data.milestoneCounts.total}
            color={color}
            label={data.title}
          />
        )}
      </header>

      {archived && (
        <p className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          This goal is archived. Unarchive it to make changes.
        </p>
      )}

      <section aria-labelledby="milestones-heading" className="flex flex-col gap-3">
        <h2 id="milestones-heading" className="font-medium">
          Milestones
        </h2>
        {!hasMilestones && !archived && (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-4">
            <p className="text-sm text-muted-foreground">
              {completed
                ? 'This goal is done. Add a milestone to keep working on it.'
                : 'Break this goal into milestones to track it, or mark it complete when it’s done.'}
            </p>
            {completed ? (
              <Button variant="outline" onClick={() => run('reopen')} disabled={action.isPending}>
                <RotateCcw />
                Reopen goal
              </Button>
            ) : (
              <Button
                onClick={() => run('complete', () => setCelebrating(true))}
                disabled={action.isPending}
              >
                <CircleCheck />
                Mark goal complete
              </Button>
            )}
          </div>
        )}
        <MilestoneList goal={data} onGoalCompleted={() => setCelebrating(true)} />
      </section>

      <section aria-labelledby="habits-heading" className="mt-10 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="habits-heading" className="font-medium">
            Habits
          </h2>
          {!archived && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => setDialog('link')}>
                <Link2 />
                Link existing
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to={`/habits/new?coreId=${data.coreId}&goalId=${data.id}`}>
                  <Plus />
                  Add habit
                </Link>
              </Button>
            </div>
          )}
        </div>
        {linkedHabits.length > 0 ? (
          <HabitList habits={linkedHabits} includeArchived unlinkable={!archived} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No habits yet. The small things you do each week are what move a goal.
          </p>
        )}
      </section>

      <CelebrationModal
        goal={data}
        color={color}
        open={celebrating}
        onOpenChange={setCelebrating}
        onArchive={() =>
          run('archive', () => {
            setCelebrating(false);
            toast.success(`${data.title} is archived. Find it under “Show archived”.`);
            void navigate('/cores');
          })
        }
        onNewGoal={() => {
          setCelebrating(false);
          setDialog('new-goal');
        }}
      />
      <GoalDialog
        open={dialog === 'edit' || dialog === 'new-goal'}
        onOpenChange={(open) => !open && setDialog(null)}
        cores={(cores.data ?? []).filter((candidate) => !candidate.archivedAt)}
        goal={dialog === 'edit' ? data : undefined}
        defaultCoreId={data.coreId}
        onSaved={(saved) => {
          if (dialog === 'new-goal') {
            void navigate(`/goals/${saved.id}`);
          }
        }}
      />
      <LinkHabitDialog
        open={dialog === 'link'}
        onOpenChange={(open) => !open && setDialog(null)}
        goal={data}
        habits={habits.data ?? []}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Delete ${data.title}?`}
        description={
          data.habits.length > 0
            ? `This can't be undone. Its milestones are deleted, and its ${data.habits.length === 1 ? 'habit is' : `${data.habits.length} habits are`} unlinked but kept.`
            : "This can't be undone. Its milestones are deleted too."
        }
        confirmLabel="Delete goal"
        destructive
        onConfirm={async () => {
          await remove.mutateAsync(data.id);
          void navigate('/cores', { replace: true });
        }}
      />
    </>
  );
}
