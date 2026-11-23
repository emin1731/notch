import { Info, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Skeleton } from '@/components/ui/skeleton';
import { useCores } from '@/features/cores/hooks';
import { useIsMobile } from '@/lib/use-is-mobile';
import { useToday } from '@/lib/use-today';
import { defaultValues } from './habit-form';
import { HabitForm } from './HabitForm';

const TITLE = 'New habit';
const DESCRIPTION = 'Something small you do regularly, that adds up.';

/**
 * "Add habit" over the current page: the full habit form, with `coreId` preselected when given.
 * A dialog, or a drawer from the bottom on phones. Saving closes it and leaves you where you were.
 */
export function AddHabitDialog({
  open,
  onOpenChange,
  coreId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coreId?: string;
}) {
  const isMobile = useIsMobile();
  const close = () => onOpenChange(false);
  // Remounted on each open, so the form starts blank every time.
  const body = open && <NewHabit coreId={coreId} onClose={close} />;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-2rem)] data-[vaul-drawer-direction=bottom]:rounded-t-3xl data-[vaul-drawer-direction=bottom]:border-t-0">
          <DrawerHeader className="px-5 pt-4 pb-4">
            <DrawerTitle>{TITLE}</DrawerTitle>
            <DrawerDescription>{DESCRIPTION}</DrawerDescription>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-lg">
        <DialogHeader className="px-5 pt-5 pr-14 pb-4 sm:px-6 sm:pt-6">
          <DialogTitle>{TITLE}</DialogTitle>
          <DialogDescription>{DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function NewHabit({ coreId, onClose }: { coreId?: string; onClose: () => void }) {
  const today = useToday();
  const cores = useCores(false);

  if (cores.isPending) {
    return (
      <div className="flex flex-col gap-3 px-5 pb-6 sm:px-6" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (cores.isError) {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="Couldn't load your cores"
        action={
          <Button variant="outline" onClick={() => void cores.refetch()}>
            Try again
          </Button>
        }
      >
        Check your connection and try again.
      </EmptyState>
    );
  }
  if (cores.data.length === 0) {
    return (
      <EmptyState
        icon={Info}
        title="Add a core first"
        action={
          <Button asChild>
            <Link to="/cores" onClick={onClose}>
              Go to Cores
            </Link>
          </Button>
        }
      >
        Every habit belongs to a core, an area of your life like health or career.
      </EmptyState>
    );
  }

  const initialCore = cores.data.find((core) => core.id === coreId) ?? cores.data[0]!;
  return (
    <HabitForm
      variant="dialog"
      cores={cores.data}
      initial={defaultValues({ coreId: initialCore.id, today })}
      cancel={
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      }
      onSaved={onClose}
    />
  );
}
