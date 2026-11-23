import { ArchiveRestore, Repeat } from 'lucide-react';
import { Fragment } from 'react';
import { toast } from 'sonner';
import { CoreIcon } from '@/components/CoreIcon';
import { Button } from '@/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
import { useArchiveCore, useCores } from '@/features/cores/hooks';
import { useArchiveHabit, useHabits } from '@/features/habits/hooks';
import { apiErrorMessage } from '@/lib/forms';
import { SETTINGS_COPY } from './copy';
import { SettingsSection } from './SettingsSection';

const failed = (error: unknown) => toast.error(apiErrorMessage(error));

/** Archived cores and habits, each with Unarchive (plan 7.5). */
export function ArchivedSection() {
  const cores = useCores(true);
  const habits = useHabits(true);
  const archiveCore = useArchiveCore();
  const archiveHabit = useArchiveHabit();

  const loading = cores.isPending || habits.isPending;
  const error = cores.isError || habits.isError;
  const coreOf = (id: string) => cores.data?.find((core) => core.id === id);
  const archivedCores = (cores.data ?? []).filter((core) => core.archivedAt !== null);
  const archivedHabits = (habits.data ?? []).filter((habit) => habit.archivedAt !== null);
  const empty = archivedCores.length + archivedHabits.length === 0;

  /** A habit can come back only once its core has. */
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
                media={<CoreIcon icon={core.icon} color={core.color} size="lg" />}
                detail="Its habits stay archived until you bring them back."
                pending={archiveCore.isPending}
                onUnarchive={() =>
                  archiveCore.mutate({ id: core.id, archive: false }, { onError: failed })
                }
              />
            ))}
          </ArchivedList>
          <ArchivedList title="Habits">
            {archivedHabits.map((habit) => {
              const blocked = blockedBy(habit.coreId);
              return (
                <ArchivedRow
                  key={habit.id}
                  media={
                    <ItemMedia variant="tile">
                      <Repeat />
                    </ItemMedia>
                  }
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
    <div className="flex flex-col gap-1">
      <h3 className="px-1 text-sm text-muted-foreground">{title}</h3>
      <ItemGroup aria-label={`Archived ${title.toLowerCase()}`} className="-mx-3">
        {children.map((child, index) => (
          <Fragment key={index}>
            {index > 0 && <ItemSeparator />}
            {child}
          </Fragment>
        ))}
      </ItemGroup>
    </div>
  );
}

function ArchivedRow({
  name,
  media,
  detail,
  blocked = false,
  pending,
  onUnarchive,
}: {
  name: string;
  /** The row's tile: a core's own, or an icon in a grey one. */
  media: React.ReactNode;
  detail?: string;
  blocked?: boolean;
  pending: boolean;
  onUnarchive: () => void;
}) {
  return (
    <Item role="listitem">
      {media}
      <ItemContent>
        <ItemTitle>{name}</ItemTitle>
        {detail && <ItemDescription>{detail}</ItemDescription>}
      </ItemContent>
      <ItemActions>
        <Button
          variant="secondary"
          size="sm"
          disabled={blocked || pending}
          aria-label={`Unarchive ${name}`}
          onClick={onUnarchive}
        >
          <ArchiveRestore />
          <span className="hidden sm:inline">Unarchive</span>
        </Button>
      </ItemActions>
    </Item>
  );
}
