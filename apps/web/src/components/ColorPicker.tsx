import { COLOR_PALETTE, type CoreColor } from '@notch/shared';
import { Check } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import { coreStyle } from '@/lib/core-colors';

const label = (color: CoreColor) => color.charAt(0).toUpperCase() + color.slice(1);

/** The core palette as swatches; arrow keys move between them. */
export function ColorPicker({
  value,
  onChange,
  id,
  ...aria
}: {
  value: CoreColor;
  onChange: (color: CoreColor) => void;
  id?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <RadioGroupPrimitive.Root
      id={id}
      value={value}
      onValueChange={(next) => onChange(next as CoreColor)}
      className="flex flex-wrap gap-2"
      orientation="horizontal"
      loop
      {...aria}
    >
      {COLOR_PALETTE.map((color) => (
        <RadioGroupPrimitive.Item
          key={color}
          value={color}
          aria-label={label(color)}
          title={label(color)}
          style={coreStyle(color)}
          className="flex size-8 items-center justify-center rounded-full bg-(--core) text-white outline-none ring-offset-2 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:ring-2 data-[state=checked]:ring-foreground"
        >
          <RadioGroupPrimitive.Indicator>
            <Check className="size-4" aria-hidden="true" />
          </RadioGroupPrimitive.Indicator>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
