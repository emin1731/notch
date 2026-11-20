import { CORE_PRESETS, type CreateCoreInput, createCoreSchema } from '@notch/shared';
import { useId, useState } from 'react';
import { Controller } from 'react-hook-form';
import { ColorPicker } from '@/components/ColorPicker';
import { CoreIcon } from '@/components/CoreIcon';
import { FormAlert } from '@/components/form/FormAlert';
import { TextField } from '@/components/form/TextField';
import { IconPicker } from '@/components/IconPicker';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { applyServerError, useZodForm } from '@/lib/forms';

/**
 * A core's name, color and icon, with the presets as shortcuts. Saving is the caller's: the API
 * for the cores page, a draft during onboarding. A rejected `onSubmit` shows its error here.
 */
export function CoreForm({
  initial,
  presets,
  submitLabel,
  onSubmit,
}: {
  initial?: CreateCoreInput;
  /** Offer the presets (when creating). */
  presets: boolean;
  submitLabel: string;
  onSubmit: (values: CreateCoreInput) => Promise<void> | void;
}) {
  const form = useZodForm(createCoreSchema, {
    defaultValues: initial ?? { name: '', color: 'emerald', icon: 'target' },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const colorLabel = useId();
  const iconLabel = useId();
  const color = form.watch('color');

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (error) {
      setFormError(applyServerError(form, error, { fields: ['name', 'color', 'icon'] }));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {presets && (
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

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
