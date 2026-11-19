import {
  addDays,
  type HabitDetailDto,
  type HeatmapDay,
  type LocalDate,
  maxLogValue,
  type StatsRange,
} from '@notch/shared';
import { Flame, Lock, Pencil, SearchX, Trophy, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { CoreChip } from '@/components/CoreChip';
import { EmptyState } from '@/components/EmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useCores } from '@/features/cores/hooks';
import { useGoals } from '@/features/goals/hooks';
import { Heatmap } from '@/features/stats/Heatmap';
import { type DayContext, dayStatus } from '@/features/stats/heatmap-model';
import { useHabitStats, useRangeParam, useSetLog, useTargetHistory } from '@/features/stats/hooks';
import { Kpi, Panel, RangeControl } from '@/features/stats/StatParts';
import { levelUpsInWindow } from '@/features/stats/stats-model';
import { TargetHistoryChart } from '@/features/stats/TargetHistoryChart';
import { earliestDate } from '@/features/today/today-model';
import { isApiError } from '@/lib/api-client';
import { formatTarget, scheduleText } from '@/lib/habit-format';
import { percent, shortDate, streakResetText, streakText, totalText } from '@/lib/stats-format';
import { useToday } from '@/lib/use-today';
import { useHabit } from './hooks';

const HABIT_RANGES = ['30d', '90d', '365d'] as const satisfies readonly StatsRange[];

/** How many recent days the log list shows (plan 7.5). */
const LOG_DAYS = 14;

/** `/habits/:habitId`: the habit's numbers, calendar, target history and recent logs. */
export default function HabitPage() {
  const { habitId = '' } = useParams();
  const habit = useHabit(habitId);

  if (habit.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading habit">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }
  if (habit.isError) {
    const missing = isApiError(habit.error) && [400, 404].includes(habit.error.status);
    return (
      <EmptyState
        icon={missing ? SearchX : TriangleAlert}
        title={missing ? 'Habit not found' : "Couldn't load this habit"}
        action={
          missing ? (
            <Button asChild variant="outline">
              <Link to="/today">Back to Today</Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => void habit.refetch()}>
              Try again
            </Button>
          )
        }
      >
        {missing
          ? 'It may have been deleted, or the link is wrong.'
          : 'Check your connection and try again.'}
      </EmptyState>
    );
  }
  return <HabitDetail habit={habit.data} />;
}

function HabitDetail({ habit }: { habit: HabitDetailDto }) {
  const [range, setRange] = useRangeParam(HABIT_RANGES, '30d');
  const stats = useHabitStats(habit.id, range);
  const history = useTargetHistory(habit.id);
  const cores = useCores(true);
  const goals = useGoals(true);
  const today = useToday();
  const core = cores.data?.find((candidate) => candidate.id === habit.coreId);
  const goal = goals.data?.find((candidate) => candidate.id === habit.goalId);
  const archived = habit.archivedAt !== null;
  const weekly = habit.scheduleType === 'TIMES_PER_WEEK';
  const context: DayContext = { habit, weekly, today };
  const levelUps = stats.data && history.data ? levelUpsInWindow(history.data, stats.data) : null;
  // A daily toggle has no target to change.
  const hasTarget = habit.type !== 'TOGGLE' || weekly;

  return (
    <>
      <header className="mb-6 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          {core ? <CoreChip name={core.name} icon={core.icon} color={core.color} /> : <span />}
          <Button asChild variant="ghost" size="sm">
            <Link to={`/habits/${habit.id}/edit`}>
              <Pencil />
              Edit
            </Link>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{habit.name}</h1>
          {archived && <Badge variant="secondary">Archived</Badge>}
        </div>
        {goal && (
          <Link
            to={`/goals/${goal.id}`}
            className="self-start rounded text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Goal: {goal.title}
          </Link>
        )}
        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Fact label="Target">{formatTarget(habit) ?? 'Done or not'}</Fact>
          <Fact label="Schedule">{scheduleText(habit)}</Fact>
          <Fact label="Current streak">
            <span className="inline-flex items-center gap-1">
              <Flame className="size-4 text-orange-600 dark:text-orange-400" aria-hidden="true" />
              {streakText(habit.currentStreak, habit.scheduleType)}
            </span>
          </Fact>
          <Fact label="Longest streak">
            <span className="inline-flex items-center gap-1">
              <Trophy className="size-4 text-muted-foreground" aria-hidden="true" />
              {streakText(habit.longestStreak, habit.scheduleType)}
            </span>
          </Fact>
        </dl>
        {!archived && habit.currentStreak === 0 && habit.longestStreak > 0 && (
          <p className="text-sm text-muted-foreground">{streakResetText(habit)}</p>
        )}
      </header>

      <RangeControl ranges={HABIT_RANGES} value={range} onChange={setRange} />

      <div className="mt-6 flex flex-col gap-6">
        {stats.isPending ? (
          <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading stats">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        ) : stats.isError ? (
          <EmptyState
            icon={TriangleAlert}
            title="Couldn't load this habit's stats"
            action={
              <Button variant="outline" onClick={() => void stats.refetch()}>
                Try again
              </Button>
            }
          >
            Check your connection and try again.
          </EmptyState>
        ) : (
          <>
            <dl aria-label="Totals" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Kpi
                label="Completion"
                value={percent(stats.data.rate)}
                detail={`${stats.data.hits} of ${stats.data.occurrences} ${weekly ? 'sessions' : 'days'}`}
              />
              <Kpi label="Total logged" value={totalText(habit, stats.data.totalValue)} />
              <Kpi
                label="Level-ups"
                value={levelUps === null ? '—' : String(levelUps)}
                detail="in this range"
              />
            </dl>
            {stats.data.heatmap.length > 0 && (
              <Heatmap days={stats.data.heatmap} color={core?.color ?? 'slate'} context={context} />
            )}
            {hasTarget && history.data && (
              <TargetHistoryChart stats={stats.data} history={history.data} habit={habit} />
            )}
            <RecentLogs
              habit={habit}
              days={stats.data.heatmap.slice(-LOG_DAYS).reverse()}
              context={context}
            />
          </>
        )}
      </div>
    </>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function dayName(date: LocalDate, today: LocalDate): string {
  if (date === today) {
    return 'Today';
  }
  return date === addDays(today, -1) ? 'Yesterday' : shortDate(date);
}

/** The last 14 days, newest first; the ones still in the backfill window can be changed. */
function RecentLogs({
  habit,
  days,
  context,
}: {
  habit: HabitDetailDto;
  days: readonly HeatmapDay[];
  context: DayContext;
}) {
  const archived = habit.archivedAt !== null;
  const earliest = [earliestDate(context.today), habit.startDate].sort().at(-1)!;
  return (
    <Panel title={`Last ${LOG_DAYS} days`}>
      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing to show before the habit started.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {days.map((day) => (
            <LogRow
              key={day.date}
              habit={habit}
              day={day}
              context={context}
              editable={!archived && day.date >= earliest && day.date <= context.today}
            />
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        {archived
          ? 'Archived habits can’t be logged. Unarchive it to log again.'
          : `Days before ${shortDate(earliest)} can’t be changed.`}
      </p>
    </Panel>
  );
}

function LogRow({
  habit,
  day,
  context,
  editable,
}: {
  habit: HabitDetailDto;
  day: HeatmapDay;
  context: DayContext;
  editable: boolean;
}) {
  const setLog = useSetLog(habit.id);
  const name = dayName(day.date, context.today);
  const save = (value: number) => {
    if (value !== day.value) {
      setLog.mutate({ date: day.date, value });
    }
  };

  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="font-medium">{name}</div>
        <div className="truncate text-xs text-muted-foreground">{dayStatus(day, context)}</div>
      </div>
      {editable ? (
        <LogInput
          habit={habit}
          value={day.value}
          label={`${habit.name}, ${name}`}
          disabled={setLog.isPending}
          onSave={save}
        />
      ) : (
        <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <ReadOnlyValue habit={habit} value={day.value} />
          <Lock className="size-3.5" aria-hidden="true" />
          <span className="sr-only">(can’t be changed)</span>
        </span>
      )}
    </li>
  );
}

function ReadOnlyValue({ habit, value }: { habit: HabitDetailDto; value: number }) {
  if (habit.type === 'TOGGLE') {
    return <>{value > 0 ? 'Done' : 'Not done'}</>;
  }
  return <span className="tabular-nums">{totalText(habit, value)}</span>;
}

/** The value in the habit's terms: a checkbox, a count, or minutes. Saves on Enter or leaving. */
function LogInput({
  habit,
  value,
  label,
  disabled,
  onSave,
}: {
  habit: HabitDetailDto;
  value: number;
  label: string;
  disabled: boolean;
  onSave: (value: number) => void;
}) {
  const minutes = habit.type === 'DURATION';
  const shown = minutes ? Math.round(value / 60) : value;
  const max = minutes ? Math.floor(maxLogValue('DURATION') / 60) : maxLogValue(habit.type);
  // Restart the field whenever the saved value changes underneath it.
  const [draft, setDraft] = useState({ for: value, text: String(shown) });
  if (draft.for !== value) {
    setDraft({ for: value, text: String(shown) });
  }

  if (habit.type === 'TOGGLE') {
    return (
      <Checkbox
        checked={value > 0}
        disabled={disabled}
        aria-label={`Done: ${label}`}
        onCheckedChange={(checked) => onSave(checked === true ? 1 : 0)}
        className="size-5"
      />
    );
  }

  const commit = () => {
    const parsed = Number(draft.text);
    if (draft.text.trim() === '' || !Number.isInteger(parsed) || parsed < 0 || parsed > max) {
      setDraft({ for: value, text: String(shown) });
      return;
    }
    if (parsed !== shown) {
      onSave(minutes ? parsed * 60 : parsed);
    }
  };

  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={draft.text}
        disabled={disabled}
        aria-label={`${minutes ? 'Minutes' : habit.unit ? `${habit.unit[0]!.toUpperCase()}${habit.unit.slice(1)}` : 'Count'}: ${label}`}
        onChange={(event) => setDraft({ for: value, text: event.target.value })}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        className="h-8 w-20 text-right tabular-nums"
      />
      <span className="w-12 text-xs text-muted-foreground">
        {minutes ? 'min' : (habit.unit ?? '')}
      </span>
    </span>
  );
}
