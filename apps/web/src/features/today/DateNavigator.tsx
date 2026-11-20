import { addDays, type LocalDate } from '@notch/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { earliestDate } from './today-model';

const formatDay = (date: LocalDate) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

/** ‹ date ›, back as far as the backfill window allows. */
export function DateNavigator({
  date,
  today,
  onChange,
}: {
  date: LocalDate;
  today: LocalDate;
  onChange: (date: LocalDate) => void;
}) {
  const backfilling = date !== today;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-full bg-card p-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous day"
          disabled={date <= earliestDate(today)}
          onClick={() => onChange(addDays(date, -1))}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-28 text-center text-sm font-medium tabular-nums" aria-live="polite">
          {formatDay(date)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Next day"
          disabled={!backfilling}
          onClick={() => onChange(addDays(date, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      {backfilling && (
        <>
          <Badge variant="secondary">Backfilling</Badge>
          <Button variant="surface" size="sm" onClick={() => onChange(today)}>
            Back to today
          </Button>
        </>
      )}
    </div>
  );
}
