import type { CoreDto } from '@notch/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CoreForm } from './CoreForm';
import { useCreateCore, useUpdateCore } from './hooks';

/** Create a core (with the presets as shortcuts), or edit one. */
export function CoreDialog({
  open,
  onOpenChange,
  core,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this core; create one without it. */
  core?: CoreDto;
}) {
  const create = useCreateCore();
  const update = useUpdateCore();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{core ? 'Edit core' : 'New core'}</DialogTitle>
          <DialogDescription>
            A core is an area of your life, like health or career. Your habits live in it.
          </DialogDescription>
        </DialogHeader>
        {/* Remounted on each open, so the form starts from the core (or blank) every time. */}
        {open && (
          <CoreForm
            initial={core && { name: core.name, color: core.color, icon: core.icon }}
            presets={!core}
            submitLabel={core ? 'Save' : 'Create core'}
            onSubmit={async (values) => {
              if (core) {
                await update.mutateAsync({ id: core.id, input: values });
              } else {
                await create.mutateAsync(values);
              }
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
