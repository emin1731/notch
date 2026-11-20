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
              'h-10 rounded-full border border-transparent text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              on
                ? 'bg-primary font-medium text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
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
