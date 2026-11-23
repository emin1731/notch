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
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      <div className="flex items-center gap-0.5 rounded-full bg-card p-1 sm:gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Previous day"
          disabled={date <= earliestDate(today)}
          onClick={() => onChange(addDays(date, -1))}
        >
          <ChevronLeft />
        </Button>
        <span
          className="min-w-20 text-center text-sm font-medium tabular-nums sm:min-w-28"
          aria-live="polite"
        >
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
          {/* As tall and as white as the date pill and the button, so the row reads as one. */}
          <Badge className="h-10 bg-card px-3 text-sm text-card-foreground sm:px-4">Past day</Badge>
          {/* "Today" on a phone, so the row fits on one line. */}
          <Button
            variant="surface"
            className="px-3 sm:px-4"
            aria-label="Back to today"
            onClick={() => onChange(today)}
          >
            <span className="sm:hidden">Today</span>
            <span className="hidden sm:inline">Back to today</span>
          </Button>
        </>
      )}
    </div>
  );
}
