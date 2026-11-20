import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** − value +, clamped to [min, max]. `format` turns the value into what's shown and announced. */
export function Stepper({
  value,
  onChange,
  min,
  max,
  format,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  format: (value: number) => string;
  /** What the value counts, for the buttons' names, e.g. "times a week". */
  label: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`Fewer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <Minus />
      </Button>
      <output aria-live="polite" className="min-w-24 text-center text-sm font-medium tabular-nums">
        {format(value)}
      </output>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label={`More ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus />
      </Button>
    </div>
  );
}
