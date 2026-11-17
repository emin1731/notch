import { type ComponentProps, type ReactNode, useId } from 'react';
import { type Control, Controller, type FieldValues, type Path } from 'react-hook-form';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type InputProps = Omit<
  ComponentProps<'input'>,
  'name' | 'value' | 'defaultValue' | 'onChange' | 'onBlur' | 'id'
>;

export interface TextFieldProps<T extends FieldValues> extends InputProps {
  control: Control<T>;
  name: Path<T>;
  label: ReactNode;
  description?: ReactNode;
  /** Turns the typed text into the form value, e.g. `''` into `undefined` for optional fields. */
  parse?: (text: string) => unknown;
  /** Rendered inside the input's right edge, e.g. a show-password button. */
  trailing?: ReactNode;
}

/** A labelled input wired to react-hook-form, with its description and error announced. */
export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  parse,
  trailing,
  className,
  ...inputProps
}: TextFieldProps<T>) {
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <div className="relative">
            <Input
              {...inputProps}
              id={id}
              name={field.name}
              ref={field.ref}
              value={(field.value as string | undefined) ?? ''}
              onChange={(event) =>
                field.onChange(parse ? parse(event.target.value) : event.target.value)
              }
              onBlur={field.onBlur}
              disabled={field.disabled || inputProps.disabled}
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={
                [description && descriptionId, fieldState.error && errorId]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              className={trailing ? `pr-10 ${className ?? ''}` : className}
            />
            {trailing && (
              <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>
            )}
          </div>
          {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
          <FieldError id={errorId} errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
}
