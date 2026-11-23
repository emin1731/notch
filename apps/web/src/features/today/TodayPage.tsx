import type { LocalDate, TimeOfDay, TodayHabit } from '@notch/shared';
import { CircleCheck, Plus, Sun, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/Section';
import { Skeleton } from '@/components/ui/skeleton';
import { AddHabitDialog } from '@/features/habits/AddHabitDialog';
import { useToday } from '@/lib/use-today';
import { DateNavigator } from './DateNavigator';
import { HabitCard } from './HabitCard';
import { useTodayView } from './hooks';
import { ProgressRing } from './ProgressRing';
import { ReviewBanner } from './ReviewBanner';
import { TimezoneBanner } from './TimezoneBanner';
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
  const [adding, setAdding] = useState(false);
  const note = backfillNote(date, today);
  const isToday = date === today;

  return (
    <>
      <header className="mb-8 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {isToday ? 'Today' : weekdayName(date)}
          </h1>
          <DateNavigator date={date} today={today} onChange={onNavigate} />
        </div>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* The day at a glance: first on phones, a side column on wide screens. */}
        <aside
          className="flex flex-col gap-3 lg:sticky lg:top-6 lg:order-last"
          aria-label="Your day"
        >
          {isToday && <TimezoneBanner />}
          {isToday && view && <ReviewBanner today={view} />}
          {view && view.dayProgress !== null && (
            <div className="flex items-center gap-5 rounded-3xl bg-card p-5 sm:p-6 lg:flex-col lg:items-start">
              <ProgressRing value={view.dayProgress} size={88} stroke={8} />
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">
                  {isToday ? 'Today' : weekdayName(date)}&apos;s progress
                </p>
                <p className="text-[0.9375rem] font-medium">{progressMessage(view.dayProgress)}</p>
              </div>
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {!view && !isError ? (
            <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading the day">
              {[0, 1, 2].map((key) => (
                <Skeleton key={key} className="h-20 rounded-3xl" />
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
                isToday
                  ? 'Nothing scheduled today'
                  : `Nothing was scheduled on ${weekdayName(date)}`
              }
              action={
                <Button variant="outline" onClick={() => setAdding(true)}>
                  <Plus />
                  Add a habit
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
        </div>
      </div>

      {/* Room to scroll the last card clear of the floating button. */}
      <div className="h-16" aria-hidden="true" />
      <Button
        size="lg"
        className="fixed right-4 bottom-24 z-10 shadow-lg md:right-8 md:bottom-8"
        onClick={() => setAdding(true)}
      >
        <Plus />
        Habit
      </Button>
      <AddHabitDialog open={adding} onOpenChange={setAdding} />
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
    <Section title={title}>
      <div className="flex flex-col gap-2">
        {habits.map((habit) => (
          <HabitCard key={habit.id} habit={habit} date={date} />
        ))}
      </div>
    </Section>
  );
}

/** Weekly habits; those whose quota is met fold away but stay loggable. */
function ThisWeek({ habits, date }: { habits: readonly TodayHabit[]; date: LocalDate }) {
  const met = (habit: TodayHabit) =>
    habit.week !== undefined && habit.week.hits >= habit.week.quota;
  const open = habits.filter((habit) => !met(habit));
  const done = habits.filter(met);
  return (
    <Section title="This week">
      <div className="flex flex-col gap-2">
        {open.map((habit) => (
          <HabitCard key={habit.id} habit={habit} date={date} />
        ))}
        {done.length > 0 && (
          <details className="group rounded-3xl bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-3xl px-5 py-4 text-sm font-medium hover:bg-card/70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <CircleCheck className="size-4" aria-hidden="true" />
              Done for the week ({done.length})
            </summary>
            <div className="flex flex-col gap-2 p-2 pt-0 [&>article]:bg-muted/50">
              {done.map((habit) => (
                <HabitCard key={habit.id} habit={habit} date={date} />
              ))}
            </div>
          </details>
        )}
      </div>
    </Section>
  );
}
