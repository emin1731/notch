import { type ReactNode, useId } from 'react';
import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';

/** A labelled native select wired to react-hook-form (native: accessible, and right on phones). */
export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  options,
  disabled,
  onValueChange,
}: {
  control: Control<T>;
  name: Path<T>;
  label: ReactNode;
  description?: ReactNode;
  options: readonly { value: string; label: string }[];
  disabled?: boolean;
  /** Runs after the field changes, e.g. to clear a dependent field. */
  onValueChange?: (value: string) => void;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <select
            id={id}
            name={field.name}
            ref={field.ref}
            value={field.value as string}
            disabled={disabled}
            onBlur={field.onBlur}
            onChange={(event) => {
              field.onChange(event.target.value);
              onValueChange?.(event.target.value);
            }}
            aria-invalid={fieldState.invalid || undefined}
            aria-describedby={
              fieldState.error ? `${id}-error` : description ? `${id}-description` : undefined
            }
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {description && (
            <FieldDescription id={`${id}-description`}>{description}</FieldDescription>
          )}
          <FieldError id={`${id}-error`} errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}
