import { ArchiveRestore } from 'lucide-react';
import { toast } from 'sonner';
import { CoreIcon } from '@/components/CoreIcon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArchiveCore, useCores } from '@/features/cores/hooks';
import { useGoalAction, useGoals } from '@/features/goals/hooks';
import { useArchiveHabit, useHabits } from '@/features/habits/hooks';
import { apiErrorMessage } from '@/lib/forms';
import { SETTINGS_COPY } from './copy';
import { SettingsSection } from './SettingsSection';

const failed = (error: unknown) => toast.error(apiErrorMessage(error));

/** Archived cores, goals and habits, each with Unarchive (plan 7.5). */
export function ArchivedSection() {
  const cores = useCores(true);
  const goals = useGoals(true);
  const habits = useHabits(true);
  const archiveCore = useArchiveCore();
  const goalAction = useGoalAction();
  const archiveHabit = useArchiveHabit();

  const loading = cores.isPending || goals.isPending || habits.isPending;
  const error = cores.isError || goals.isError || habits.isError;
  const coreOf = (id: string) => cores.data?.find((core) => core.id === id);
  const archivedCores = (cores.data ?? []).filter((core) => core.archivedAt !== null);
  const archivedGoals = (goals.data ?? []).filter((goal) => goal.archivedAt !== null);
  const archivedHabits = (habits.data ?? []).filter((habit) => habit.archivedAt !== null);
  const empty = archivedCores.length + archivedGoals.length + archivedHabits.length === 0;

  /** A goal or habit can come back only once its core has. */
  const blockedBy = (coreId: string) => {
    const core = coreOf(coreId);
    return core?.archivedAt ? core.name : null;
  };

  return (
    <SettingsSection
      title="Archived"
      description="Archived things keep their history. Unarchive one to bring it back."
    >
      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading archived items">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Couldn’t load your archived items.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void cores.refetch();
              void goals.refetch();
              void habits.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : empty ? (
        <p className="text-sm text-muted-foreground">{SETTINGS_COPY.nothingArchived}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <ArchivedList title="Cores">
            {archivedCores.map((core) => (
              <ArchivedRow
                key={core.id}
                name={core.name}
                icon={<CoreIcon icon={core.icon} color={core.color} size="sm" />}
                detail="Its goals and habits stay archived until you bring them back."
                pending={archiveCore.isPending}
                onUnarchive={() =>
                  archiveCore.mutate({ id: core.id, archive: false }, { onError: failed })
                }
              />
            ))}
          </ArchivedList>
          <ArchivedList title="Goals">
            {archivedGoals.map((goal) => {
              const blocked = blockedBy(goal.coreId);
              return (
                <ArchivedRow
                  key={goal.id}
                  name={goal.title}
                  detail={
                    blocked ? SETTINGS_COPY.coreArchivedFirst(blocked) : coreOf(goal.coreId)?.name
                  }
                  blocked={blocked !== null}
                  pending={goalAction.isPending}
                  onUnarchive={() =>
                    goalAction.mutate({ id: goal.id, action: 'unarchive' }, { onError: failed })
                  }
                />
              );
            })}
          </ArchivedList>
          <ArchivedList title="Habits">
            {archivedHabits.map((habit) => {
              const blocked = blockedBy(habit.coreId);
              return (
                <ArchivedRow
                  key={habit.id}
                  name={habit.name}
                  detail={
                    blocked ? SETTINGS_COPY.coreArchivedFirst(blocked) : coreOf(habit.coreId)?.name
                  }
                  blocked={blocked !== null}
                  pending={archiveHabit.isPending}
                  onUnarchive={() =>
                    archiveHabit.mutate({ id: habit.id, archive: false }, { onError: failed })
                  }
                />
              );
            })}
          </ArchivedList>
        </div>
      )}
    </SettingsSection>
  );
}

function ArchivedList({ title, children }: { title: string; children: React.ReactNode[] }) {
  if (children.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm text-muted-foreground">{title}</h3>
      <ul
        className="flex flex-col divide-y rounded-lg border"
        aria-label={`Archived ${title.toLowerCase()}`}
      >
        {children}
      </ul>
    </div>
  );
}

function ArchivedRow({
  name,
  icon,
  detail,
  blocked = false,
  pending,
  onUnarchive,
}: {
  name: string;
  icon?: React.ReactNode;
  detail?: string;
  blocked?: boolean;
  pending: boolean;
  onUnarchive: () => void;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{name}</div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={blocked || pending}
        aria-label={`Unarchive ${name}`}
        onClick={onUnarchive}
      >
        <ArchiveRestore />
        <span className="hidden sm:inline">Unarchive</span>
      </Button>
    </li>
  );
}
