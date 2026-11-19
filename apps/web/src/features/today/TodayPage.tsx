import type { LocalDate, TimeOfDay, TodayHabit } from '@notch/shared';
import { CircleCheck, Plus, Sun, TriangleAlert } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToday } from '@/lib/use-today';
import { DateNavigator } from './DateNavigator';
import { HabitCard } from './HabitCard';
import { useTodayView } from './hooks';
import { ProgressRing } from './ProgressRing';
import { backfillNote, clampDate, progressMessage, weekdayName } from './today-model';

const GROUP_TITLES: Record<TimeOfDay, string> = {
  MORNING: 'Morning',
  AFTERNOON: 'Afternoon',
  EVENING: 'Evening',
  ANYTIME: 'Anytime',
};

export default function TodayPage() {
  const today = useToday();
  const [params, setParams] = useSearchParams();
  const param = params.get('date');
  const date = clampDate(param, today) ?? today;

  // A day outside the window (or not a date) shows today instead.
  if (param !== null && param !== date) {
    return <Navigate to="/today" replace />;
  }

  const go = (next: LocalDate) => setParams(next === today ? {} : { date: next });
  return <Day key={date} date={date} today={today} onNavigate={go} />;
}

function Day({
  date,
  today,
  onNavigate,
}: {
  date: LocalDate;
  today: LocalDate;
  onNavigate: (date: LocalDate) => void;
}) {
  const { view, isError, refetch } = useTodayView(date);
  const note = backfillNote(date, today);
  const isToday = date === today;

  return (
    <>
      <header className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isToday ? 'Today' : weekdayName(date)}
          </h1>
          <DateNavigator date={date} today={today} onChange={onNavigate} />
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        {view && view.dayProgress !== null && (
          <div className="flex items-center gap-4 rounded-xl border bg-card p-4">
            <ProgressRing value={view.dayProgress} />
            <p className="text-sm">{progressMessage(view.dayProgress)}</p>
          </div>
        )}
      </header>

      {!view && !isError ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the day">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : !view ? (
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load your day"
          action={
            <Button variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        >
          Check your connection and try again.
        </EmptyState>
      ) : view.groups.length === 0 && view.weeklyQuota.length === 0 ? (
        <EmptyState
          icon={Sun}
          title={
            isToday ? 'Nothing scheduled today' : `Nothing was scheduled on ${weekdayName(date)}`
          }
          action={
            <Button asChild variant="outline">
              <Link to="/habits/new">
                <Plus />
                Add a habit
              </Link>
            </Button>
          }
        >
          {isToday ? 'Enjoy it, or add a habit.' : 'Nothing to log for that day.'}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {view.groups.map((group) => (
            <HabitGroup
              key={group.timeOfDay}
              title={GROUP_TITLES[group.timeOfDay]}
              habits={group.habits}
              date={date}
            />
          ))}
          {view.weeklyQuota.length > 0 && <ThisWeek habits={view.weeklyQuota} date={date} />}
        </div>
      )}

      {/* Room to scroll the last card clear of the floating button. */}
      <div className="h-16" aria-hidden="true" />
      <Button
        asChild
        size="lg"
        className="fixed right-4 bottom-20 z-10 rounded-full shadow-lg md:right-8 md:bottom-8"
      >
        <Link to="/habits/new">
          <Plus />
          Habit
        </Link>
      </Button>
    </>
  );
}

function HabitGroup({
  title,
  habits,
  date,
}: {
  title: string;
  habits: readonly TodayHabit[];
  date: LocalDate;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {habits.map((habit) => (
        <HabitCard key={habit.id} habit={habit} date={date} />
      ))}
    </section>
  );
}

/** Weekly habits; those whose quota is met fold away but stay loggable. */
function ThisWeek({ habits, date }: { habits: readonly TodayHabit[]; date: LocalDate }) {
  const met = (habit: TodayHabit) =>
    habit.week !== undefined && habit.week.hits >= habit.week.quota;
  const open = habits.filter((habit) => !met(habit));
  const done = habits.filter(met);
  return (
    <section aria-label="This week" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">This week</h2>
      {open.map((habit) => (
        <HabitCard key={habit.id} habit={habit} date={date} />
      ))}
      {done.length > 0 && (
        <details className="group rounded-xl border border-dashed">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
            <CircleCheck
              className="size-4 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            Done for the week ({done.length})
          </summary>
          <div className="flex flex-col gap-2 p-2 pt-0">
            {done.map((habit) => (
              <HabitCard key={habit.id} habit={habit} date={date} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
