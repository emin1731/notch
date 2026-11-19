import { type ScheduleType, STATS_RANGES, type StatsOverviewDto } from '@notch/shared';
import { ChartColumn, CircleCheck, Flame, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { CoreIcon } from '@/components/CoreIcon';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar } from '@/components/ProgressBar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCores } from '@/features/cores/hooks';
import { useHabits } from '@/features/habits/hooks';
import { coreStyle } from '@/lib/core-colors';
import { formatLocalDate } from '@/lib/deadline';
import { dateRangeText, percent, streakText, streakUnit } from '@/lib/stats-format';
import { CompletionChart } from './CompletionChart';
import { useRangeParam, useStatsOverview } from './hooks';
import { Kpi, Panel, RangeControl } from './StatParts';

export default function StatsPage() {
  const [range, setRange] = useRangeParam(STATS_RANGES, '30d');
  const overview = useStatsOverview(range);
  const habits = useHabits(true);

  if (habits.data?.length === 0) {
    return (
      <>
        <PageHeader title="Stats" />
        <EmptyState
          icon={ChartColumn}
          title="No stats yet"
          action={
            <Button asChild>
              <Link to="/habits/new">Create a habit</Link>
            </Button>
          }
        >
          Stats fill in once you have a habit or two to log.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Stats"
        description={
          overview.data ? dateRangeText(overview.data.from, overview.data.to) : undefined
        }
      />
      <RangeControl ranges={STATS_RANGES} value={range} onChange={setRange} />
      <div className="mt-6">
        {overview.isPending ? (
          <StatsSkeleton />
        ) : overview.isError ? (
          <EmptyState
            icon={TriangleAlert}
            title="Couldn't load your stats"
            action={
              <Button variant="outline" onClick={() => void overview.refetch()}>
                Try again
              </Button>
            }
          >
            Check your connection and try again.
          </EmptyState>
        ) : (
          <Overview
            data={overview.data}
            scheduleOf={(id) => habits.data?.find((habit) => habit.id === id)?.scheduleType}
          />
        )}
      </div>
    </>
  );
}

function Overview({
  data,
  scheduleOf,
}: {
  data: StatsOverviewDto;
  scheduleOf: (habitId: string) => ScheduleType | undefined;
}) {
  const best = data.topStreaks[0];
  return (
    <div className="flex flex-col gap-6">
      <dl aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Completion" value={percent(data.overallRate)} detail="of what you planned" />
        <Kpi
          label="Best streak"
          value={best ? String(best.currentStreak) : '—'}
          detail={
            best
              ? `${streakUnit(best.currentStreak, scheduleOf(best.habitId) ?? 'DAILY')} · ${best.name}`
              : 'No streak going yet'
          }
        />
        <Kpi
          label="Goals completed"
          value={String(data.goals.completedInRange)}
          detail={`${data.goals.active} active`}
        />
        <Kpi
          label="Target changes"
          value={`↑${data.changes.levelUps} ↓${data.changes.deloads}`}
          valueLabel={`${data.changes.levelUps} up, ${data.changes.deloads} eased off`}
          detail={`${data.changes.levelUps} up · ${data.changes.deloads} eased off`}
        />
      </dl>

      <CompletionChart daily={data.daily} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="By core">
          {data.cores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cores with habits yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.cores.map((core) => (
                <li
                  key={core.coreId}
                  style={coreStyle(core.color)}
                  className="flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <CoreIcon icon={core.icon} color={core.color} size="sm" />
                      <span className="truncate font-medium">{core.name}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {percent(core.rate)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-(--core)"
                      style={{ width: `${Math.round((core.rate ?? 0) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Streak leaderboard">
          {data.topStreaks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No streaks going. One good day starts one.
            </p>
          ) : (
            <ol className="flex flex-col divide-y">
              {data.topStreaks.map((entry, index) => (
                <li key={entry.habitId}>
                  <Link
                    to={`/habits/${entry.habitId}`}
                    className="flex items-center gap-3 rounded py-2 text-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="w-4 text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.name}</span>
                    <span className="flex items-center gap-1 text-orange-600 tabular-nums dark:text-orange-400">
                      <Flame className="size-4" aria-hidden="true" />
                      {streakText(entry.currentStreak, scheduleOf(entry.habitId) ?? 'DAILY')}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Goals goals={data.goals.items} />
    </div>
  );
}

function Goals({ goals }: { goals: StatsOverviewDto['goals']['items'] }) {
  const cores = useCores(true);
  const colorOf = (coreId: string) =>
    cores.data?.find((core) => core.id === coreId)?.color ?? 'slate';
  const active = goals.filter((goal) => goal.status === 'ACTIVE');
  const completed = goals.filter((goal) => goal.status === 'COMPLETED');
  return (
    <Panel title="Goals">
      {goals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active goals, and none completed in this range.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {active.length > 0 && (
            <ul className="flex flex-col gap-3" aria-label="Active goals">
              {active.map((goal) => (
                <li key={goal.id} className="flex flex-col gap-1">
                  <Link
                    to={`/goals/${goal.id}`}
                    className="self-start rounded text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {goal.title}
                  </Link>
                  {goal.milestoneCounts.total > 0 ? (
                    <ProgressBar
                      done={goal.milestoneCounts.done}
                      total={goal.milestoneCounts.total}
                      color={colorOf(goal.coreId)}
                      label={goal.title}
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">No milestones</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {completed.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm text-muted-foreground">Completed in this range</h3>
              <ul className="flex flex-col gap-1.5" aria-label="Completed goals">
                {completed.map((goal) => (
                  <li key={goal.id} className="flex items-center gap-2 text-sm">
                    <CircleCheck
                      className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                      aria-hidden="true"
                    />
                    <Link
                      to={`/goals/${goal.id}`}
                      className="min-w-0 truncate font-medium hover:underline"
                    >
                      {goal.title}
                    </Link>
                    {goal.completedAt && (
                      <span className="ml-auto shrink-0 text-muted-foreground">
                        {formatLocalDate(goal.completedAt.slice(0, 10))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading stats">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
