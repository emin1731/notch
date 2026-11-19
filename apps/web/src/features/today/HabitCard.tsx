import { type LocalDate, maxLogValue, type TodayHabit } from '@notch/shared';
import {
  Archive,
  ChartLine,
  Check,
  Flame,
  Minus,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Square,
} from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useArchiveHabit } from '@/features/habits/hooks';
import { coreStyle } from '@/lib/core-colors';
import { apiErrorMessage } from '@/lib/forms';
import { cn } from '@/lib/utils';
import { useLogSync } from './log-sync-context';
import { formatClock, useElapsed, useTimer } from './timer';
import { useTimerActions } from './timer-actions';

/** One habit on Today: its control for the type, progress, streak and menu (plan 7.5). */
export function HabitCard({ habit, date }: { habit: TodayHabit; date: LocalDate }) {
  const titleId = useId();
  const archive = useArchiveHabit();
  const target = habit.log?.targetSnapshot ?? habit.target;
  const done = habit.progress >= 1;

  return (
    <article
      aria-labelledby={titleId}
      style={coreStyle(habit.core.color)}
      className={cn(
        'flex flex-col gap-3 rounded-xl border border-l-4 border-l-(--core) bg-card p-3 text-card-foreground transition-colors',
        done && 'bg-(--core)/5',
      )}
    >
      <div className="flex items-center gap-3">
        {habit.type === 'TOGGLE' && <ToggleControl habit={habit} date={date} />}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="truncate font-medium">
            {habit.name}
          </h3>
          <p className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{habit.goal?.title ?? habit.core.name}</span>
            {habit.week && <WeekDots hits={habit.week.hits} quota={habit.week.quota} />}
          </p>
        </div>
        {habit.currentStreak > 0 && (
          <span
            className="flex shrink-0 items-center gap-0.5 text-sm font-medium tabular-nums text-orange-600 dark:text-orange-400"
            aria-label={`${habit.currentStreak}-day streak`}
            title={`${habit.currentStreak}-day streak`}
          >
            <Flame className="size-4" aria-hidden="true" />
            {habit.currentStreak}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`${habit.name} actions`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link to={`/habits/${habit.id}/edit`}>
                <Pencil />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to={`/habits/${habit.id}`}>
                <ChartLine />
                View stats
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                archive.mutate(
                  { id: habit.id, archive: true },
                  {
                    onSuccess: () =>
                      toast.success(`${habit.name} is archived. Find it in Cores & Goals.`),
                    onError: (error) => toast.error(apiErrorMessage(error)),
                  },
                )
              }
            >
              <Archive />
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {habit.type === 'COUNT' && <CounterControl habit={habit} date={date} target={target} />}
      {habit.type === 'DURATION' && <DurationControl habit={habit} date={date} target={target} />}
      {habit.type !== 'TOGGLE' && <Bar progress={habit.progress} />}
    </article>
  );
}

const valueOf = (habit: TodayHabit) => habit.log?.value ?? 0;
const logTarget = (habit: TodayHabit) => ({
  id: habit.id,
  type: habit.type,
  value: valueOf(habit),
});

function ToggleControl({ habit, date }: { habit: TodayHabit; date: LocalDate }) {
  const sync = useLogSync();
  const done = valueOf(habit) > 0;
  return (
    <button
      type="button"
      aria-pressed={done}
      aria-label={`${habit.name} done`}
      onClick={() => sync.set(date, logTarget(habit), done ? 0 : 1)}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        done
          ? 'border-(--core) bg-(--core) text-white'
          : 'border-muted-foreground/30 text-transparent hover:border-(--core) hover:text-(--core)/60',
      )}
    >
      <Check className="size-6" strokeWidth={3} aria-hidden="true" />
    </button>
  );
}

function CounterControl({
  habit,
  date,
  target,
}: {
  habit: TodayHabit;
  date: LocalDate;
  target: number;
}) {
  const sync = useLogSync();
  const value = valueOf(habit);
  const unit = habit.unit ? ` ${habit.unit}` : '';
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label={`One less ${habit.name}`}
        disabled={value === 0}
        onClick={() => sync.tap(date, logTarget(habit), -1)}
      >
        <Minus />
      </Button>
      <InlineNumber
        label={`${habit.name} count`}
        value={value}
        max={maxLogValue('COUNT')}
        onCommit={(next) => sync.set(date, logTarget(habit), next)}
      >
        <span className="font-semibold">{value}</span>
        <span className="text-muted-foreground">
          {' '}
          / {target}
          {unit}
        </span>
      </InlineNumber>
      <Button
        variant="outline"
        size="icon"
        aria-label={`One more ${habit.name}`}
        onClick={() => sync.tap(date, logTarget(habit), 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}

/** Whole minutes for a logged duration; "<1" for under a minute. */
const minutesText = (seconds: number) =>
  seconds > 0 && seconds < 60 ? '<1' : String(Math.floor(seconds / 60));

function DurationControl({
  habit,
  date,
  target,
}: {
  habit: TodayHabit;
  date: LocalDate;
  target: number;
}) {
  const sync = useLogSync();
  const timer = useTimerActions();
  const running = useTimer((state) => state.running);
  const mine = running?.habitId === habit.id;
  const elapsed = useElapsed(mine ? running.startedAt : undefined);
  const [adding, setAdding] = useState(false);
  const value = valueOf(habit);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={mine ? 'default' : 'outline'}
          size="icon"
          aria-label={mine ? `Stop timer for ${habit.name}` : `Start timer for ${habit.name}`}
          onClick={() => (mine ? timer.stop() : timer.start(habit, date))}
        >
          {mine ? <Square /> : <Play />}
        </Button>
        <InlineNumber
          label={`${habit.name} minutes`}
          value={Math.floor(value / 60)}
          max={24 * 60}
          onCommit={(minutes) => sync.set(date, logTarget(habit), minutes * 60)}
        >
          <span className="font-semibold">{minutesText(value)}</span>
          <span className="text-muted-foreground"> / {Math.round(target / 60)} min</span>
        </InlineNumber>
        {mine && (
          <span className="text-sm font-medium tabular-nums text-(--core)" aria-live="off">
            {formatClock(elapsed)}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-muted-foreground"
          aria-expanded={adding}
          onClick={() => setAdding((open) => !open)}
        >
          <Plus />
          Add time
        </Button>
      </div>
      {adding && (
        <AddTime
          habitName={habit.name}
          onAdd={(minutes) => {
            setAdding(false);
            void sync.increment(date, logTarget(habit), minutes * 60);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function AddTime({
  habitName,
  onAdd,
  onCancel,
}: {
  habitName: string;
  onAdd: (minutes: number) => void;
  onCancel: () => void;
}) {
  const [minutes, setMinutes] = useState('');
  const id = useId();
  const value = Number(minutes);
  const valid = minutes.trim() !== '' && Number.isInteger(value) && value >= 1 && value <= 24 * 60;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) {
      onAdd(value);
    }
  };
  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Minutes to add to {habitName}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={24 * 60}
        placeholder="Minutes"
        autoFocus
        value={minutes}
        onChange={(event) => setMinutes(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onCancel()}
        className="h-8 w-28"
      />
      <Button type="submit" size="sm" disabled={!valid}>
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

/** A value that turns into a number input when tapped: Enter or leaving saves, Escape cancels. */
function InlineNumber({
  label,
  value,
  max,
  onCommit,
  children,
}: {
  label: string;
  value: number;
  max: number;
  onCommit: (value: number) => void;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(String(value))}
        className="rounded-md px-2 py-1 text-sm tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        {children}
        <span className="sr-only">, edit {label}</span>
      </button>
    );
  }

  const save = () => {
    const next = Number(draft);
    setDraft(null);
    if (
      draft.trim() !== '' &&
      Number.isInteger(next) &&
      next >= 0 &&
      next <= max &&
      next !== value
    ) {
      onCommit(next);
    }
  };
  return (
    <Input
      aria-label={label}
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          save();
        } else if (event.key === 'Escape') {
          setDraft(null);
        }
      }}
      className="h-8 w-24"
    />
  );
}

function Bar({ progress }: { progress: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div
        className="h-full rounded-full bg-(--core) transition-[width] duration-300"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}

/** "2 / 3 this week" as dots. */
function WeekDots({ hits, quota }: { hits: number; quota: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1" aria-label={`${hits} of ${quota} this week`}>
      {Array.from({ length: quota }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            'size-1.5 rounded-full',
            index < hits ? 'bg-(--core)' : 'bg-muted-foreground/25',
          )}
        />
      ))}
      <span aria-hidden="true" className="tabular-nums">
        {hits} / {quota}
      </span>
    </span>
  );
}
