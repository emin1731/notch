import type { LucideIcon } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** A row of mutually exclusive choices (a radio group): arrow keys move, the choice follows. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className,
  ...aria
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  disabled?: boolean;
  className?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onChange(next as T)}
      disabled={disabled}
      orientation="horizontal"
      loop
      className={cn(
        'grid auto-cols-fr grid-flow-col gap-0.5 rounded-lg bg-muted p-0.5',
        disabled && 'opacity-60',
        className,
      )}
      {...aria}
    >
      {options.map(({ value: option, label, icon: Icon }) => (
        <RadioGroupPrimitive.Item
          key={option}
          value={option}
          className={cn(
            'flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors outline-none',
            'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed',
            'data-[state=checked]:bg-background data-[state=checked]:font-medium data-[state=checked]:text-foreground data-[state=checked]:shadow-sm',
          )}
        >
          {Icon && <Icon className="size-4 shrink-0" aria-hidden="true" />}
          <span className="truncate">{label}</span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
