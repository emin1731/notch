import { CORE_PRESETS, type CoreDto, createCoreSchema } from '@notch/shared';
import { useId, useState } from 'react';
import { Controller } from 'react-hook-form';
import { ColorPicker } from '@/components/ColorPicker';
import { CoreIcon } from '@/components/CoreIcon';
import { FormAlert } from '@/components/form/FormAlert';
import { TextField } from '@/components/form/TextField';
import { IconPicker } from '@/components/IconPicker';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { applyServerError, useZodForm } from '@/lib/forms';
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Remounted on each open, so the form starts from the core (or blank) every time. */}
        {open && <CoreForm core={core} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function CoreForm({ core, onDone }: { core?: CoreDto; onDone: () => void }) {
  const create = useCreateCore();
  const update = useUpdateCore();
  const form = useZodForm(createCoreSchema, {
    defaultValues: core
      ? { name: core.name, color: core.color, icon: core.icon }
      : { name: '', color: 'emerald', icon: 'target' },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const colorLabel = useId();
  const iconLabel = useId();
  const color = form.watch('color');

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (core) {
        await update.mutateAsync({ id: core.id, input: values });
      } else {
        await create.mutateAsync(values);
      }
      onDone();
    } catch (error) {
      setFormError(applyServerError(form, error, { fields: ['name', 'color', 'icon'] }));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{core ? 'Edit core' : 'New core'}</DialogTitle>
        <DialogDescription>
          A core is an area of your life, like health or career. Goals and habits live in it.
        </DialogDescription>
      </DialogHeader>

      {!core && (
        <div>
          <p className="mb-2 text-sm font-medium">Start from a preset</p>
          <div className="flex flex-wrap gap-2">
            {CORE_PRESETS.map((preset) => (
              <Button
                key={preset.name}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  form.setValue('name', preset.name, { shouldValidate: true });
                  form.setValue('color', preset.color);
                  form.setValue('icon', preset.icon);
                }}
              >
                <CoreIcon icon={preset.icon} color={preset.color} size="sm" className="-ml-1" />
                {preset.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      <FieldGroup>
        <FormAlert message={formError} />
        <TextField control={form.control} name="name" label="Name" autoComplete="off" autoFocus />
        <Field>
          <FieldLabel id={colorLabel}>Color</FieldLabel>
          <Controller
            control={form.control}
            name="color"
            render={({ field }) => (
              <ColorPicker
                value={field.value}
                onChange={field.onChange}
                aria-labelledby={colorLabel}
              />
            )}
          />
        </Field>
        <Field>
          <FieldLabel id={iconLabel}>Icon</FieldLabel>
          <Controller
            control={form.control}
            name="icon"
            render={({ field }) => (
              <IconPicker
                value={field.value}
                onChange={field.onChange}
                color={color}
                labelledBy={iconLabel}
              />
            )}
          />
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : core ? 'Save' : 'Create core'}
        </Button>
      </DialogFooter>
    </form>
  );
}
