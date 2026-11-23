import { type ScheduleType, STATS_RANGES, type StatsOverviewDto } from '@notch/shared';
import { ChartColumn, Flame, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { CoreIcon } from '@/components/CoreIcon';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useHabits } from '@/features/habits/hooks';
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
        actions={<RangeControl ranges={STATS_RANGES} value={range} onChange={setRange} />}
      />
      <div>
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
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CompletionChart
          daily={data.daily}
          headline={
            <>
              <p className="text-5xl font-bold tracking-tight tabular-nums">
                {percent(data.overallRate)}
              </p>
              <p className="text-sm text-muted-foreground">of what you planned</p>
            </>
          }
        />

        <Panel title="By core">
          {data.cores.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cores with habits yet.</p>
          ) : (
            <ul className="-mx-1 flex flex-col gap-5">
              {data.cores.map((core) => (
                <li key={core.coreId} className="flex flex-col gap-3 px-1">
                  <div className="flex items-center gap-3">
                    <CoreIcon icon={core.icon} color={core.color} size="lg" />
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                      {core.name}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {percent(core.rate)}
                    </span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                    <div
                      className="h-full rounded-full bg-foreground"
                      style={{ width: `${Math.round((core.rate ?? 0) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title="Streak leaderboard">
          {data.topStreaks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No streaks going. One good day starts one.
            </p>
          ) : (
            <ol className="-mx-3 flex flex-col">
              {data.topStreaks.map((entry, index) => (
                <li key={entry.habitId}>
                  <Link
                    to={`/habits/${entry.habitId}`}
                    className="flex items-center gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted font-semibold tabular-nums">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[0.9375rem] font-medium">
                      {entry.name}
                    </span>
                    <span className="flex items-center gap-1 text-sm font-medium text-orange-600 tabular-nums dark:text-orange-400">
                      <Flame className="size-4" aria-hidden="true" />
                      {streakText(entry.currentStreak, scheduleOf(entry.habitId) ?? 'DAILY')}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        {/* Under "By core", so both rows share the chart's columns. */}
        <dl aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-1">
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
            label="Target changes"
            value={`↑${data.changes.levelUps} ↓${data.changes.deloads}`}
            valueLabel={`${data.changes.levelUps} up, ${data.changes.deloads} eased off`}
            detail={`${data.changes.levelUps} up · ${data.changes.deloads} eased off`}
          />
        </dl>
      </div>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading stats">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-28 rounded-3xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-3xl" />
    </div>
  );
}
