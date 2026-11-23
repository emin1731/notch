import { CORE_PRESETS, type CoreDto, type HabitDto } from '@notch/shared';
import { Layers, Plus, TriangleAlert } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CoreIcon } from '@/components/CoreIcon';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { SortableList } from '@/components/SortableList';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useHabits } from '@/features/habits/hooks';
import { apiErrorMessage } from '@/lib/forms';
import { CoreCard } from './CoreCard';
import { CoreDialog } from './CoreDialog';
import { useArchiveCore, useCores, useCreateCore, useDeleteCore, useReorderCores } from './hooks';

type Dialog =
  { kind: 'core'; core?: CoreDto } | { kind: 'archive' | 'delete'; core: CoreDto } | null;

export default function CoresPage() {
  const [showArchived, setShowArchived] = useState(false);
  const cores = useCores(showArchived);
  const habits = useHabits(showArchived);
  const reorder = useReorderCores(showArchived);
  const archiveCore = useArchiveCore();
  const deleteCore = useDeleteCore();
  const [dialog, setDialog] = useState<Dialog>(null);
  const switchId = useId();

  const habitsByCore = useMemo(() => {
    const map = new Map<string, HabitDto[]>();
    for (const habit of habits.data ?? []) {
      map.set(habit.coreId, [...(map.get(habit.coreId) ?? []), habit]);
    }
    return map;
  }, [habits.data]);

  const unarchive = async (run: () => Promise<unknown>, done: string) => {
    try {
      await run();
      toast.success(done);
    } catch (error) {
      toast.error(apiErrorMessage(error));
    }
  };

  let content;
  if (cores.isPending || habits.isPending) {
    content = (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading cores">
        {[0, 1].map((key) => (
          <Skeleton key={key} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  } else if (cores.isError || habits.isError) {
    content = (
      <EmptyState
        icon={TriangleAlert}
        title="Couldn't load your cores"
        action={
          <Button
            variant="outline"
            onClick={() => {
              void cores.refetch();
              void habits.refetch();
            }}
          >
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </EmptyState>
    );
  } else if (cores.data.length === 0) {
    content = <NoCores onCustom={() => setDialog({ kind: 'core' })} />;
  } else {
    content = (
      <SortableList
        items={cores.data}
        getLabel={(core) => core.name}
        onReorder={(ids) => reorder.mutate(ids)}
        className="flex flex-col gap-4"
        renderItem={(core, handle) => (
          <CoreCard
            core={core}
            habits={habitsByCore.get(core.id) ?? []}
            includeArchived={showArchived}
            handle={handle}
            actions={{
              onEdit: () => setDialog({ kind: 'core', core }),
              onArchive: () => setDialog({ kind: 'archive', core }),
              onUnarchive: () =>
                void unarchive(
                  () => archiveCore.mutateAsync({ id: core.id, archive: false }),
                  `${core.name} is back. Unarchive its habits one by one.`,
                ),
              onDelete: () => setDialog({ kind: 'delete', core }),
            }}
          />
        )}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Cores"
        description="The areas of your life, and the habits that build each one."
        actions={
          <Button onClick={() => setDialog({ kind: 'core' })}>
            <Plus />
            Add core
          </Button>
        }
      />

      {content}

      {!cores.isPending && !cores.isError && (cores.data.length > 0 || showArchived) && (
        <div className="mt-6 flex items-center gap-2">
          <Switch id={switchId} checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor={switchId}>Show archived</Label>
        </div>
      )}

      <CoreDialog
        open={dialog?.kind === 'core'}
        onOpenChange={(open) => !open && setDialog(null)}
        core={dialog?.kind === 'core' ? dialog.core : undefined}
      />
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Archive ${dialog?.kind === 'archive' ? dialog.core.name : 'core'}?`}
        description="Its habits are archived with it and leave Today. Nothing is deleted: turn on “Show archived” to bring them back."
        confirmLabel="Archive"
        onConfirm={() =>
          dialog?.kind === 'archive'
            ? archiveCore.mutateAsync({ id: dialog.core.id, archive: true })
            : Promise.resolve()
        }
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(open) => !open && setDialog(null)}
        title={`Delete ${dialog?.kind === 'delete' ? dialog.core.name : 'core'}?`}
        description="This can't be undone. Only an empty core can be deleted: one without habits, archived ones included."
        confirmLabel="Delete core"
        destructive
        onConfirm={() =>
          dialog?.kind === 'delete' ? deleteCore.mutateAsync(dialog.core.id) : Promise.resolve()
        }
      />
    </>
  );
}

/** No cores yet: one click on a preset creates it. */
function NoCores({ onCustom }: { onCustom: () => void }) {
  const create = useCreateCore();
  return (
    <EmptyState
      icon={Layers}
      title="Start with a core"
      action={
        <div className="flex max-w-md flex-col items-center gap-4">
          <div className="flex flex-wrap justify-center gap-2">
            {CORE_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                variant="outline"
                disabled={create.isPending}
                onClick={() =>
                  create.mutate(
                    { name: preset.name, color: preset.color, icon: preset.icon },
                    { onError: (error) => toast.error(apiErrorMessage(error)) },
                  )
                }
              >
                <CoreIcon icon={preset.icon} color={preset.color} size="sm" className="-ml-1" />
                {preset.name}
              </Button>
            ))}
          </div>
          <Button variant="ghost" onClick={onCustom}>
            <Plus />
            Make your own
          </Button>
        </div>
      }
    >
      Cores are the areas of your life you want to grow in. Pick one to begin, or make your own.
    </EmptyState>
  );
}
