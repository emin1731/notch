import { WEEKDAYS } from '@/lib/habit-format';
import { cn } from '@/lib/utils';

/** Seven day toggles, Monday first. The value is sorted ISO weekdays (1 = Monday … 7 = Sunday). */
export function WeekdayPicker({
  value,
  onChange,
  invalid,
  ...aria
}: {
  value: readonly number[];
  onChange: (days: number[]) => void;
  invalid?: boolean;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}) {
  const toggle = (day: number) =>
    onChange(
      value.includes(day) ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b),
    );
  return (
    <div role="group" className="grid grid-cols-7 gap-1" {...aria}>
      {WEEKDAYS.map(({ day, short, long }) => {
        const on = value.includes(day);
        return (
          <button
            key={day}
            type="button"
            aria-pressed={on}
            aria-label={long}
            onClick={() => toggle(day)}
            className={cn(
              'h-9 rounded-md border text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on
                ? 'border-primary bg-primary font-medium text-primary-foreground'
                : 'border-input text-muted-foreground hover:bg-muted',
              invalid && !on && 'border-destructive/60',
            )}
          >
            {short}
          </button>
        );
      })}
    </div>
  );
}
