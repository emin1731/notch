import type { StatsOverviewDto } from '@notch/shared';
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { percent, shortDate } from '@/lib/stats-format';
import { ChartCard, StatTable } from './ChartCard';

type Daily = StatsOverviewDto['daily'];

const dayOfMonth = (date: string) => String(Number(date.slice(8, 10)));
const monthDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

function summaryOf(daily: Daily): string {
  const rated = daily.filter((day) => day.rate !== null);
  if (rated.length === 0) {
    return 'No days to count in this range yet.';
  }
  const best = rated.reduce((top, day) => (day.rate! > top.rate! ? day : top));
  const average = rated.reduce((sum, day) => sum + day.rate!, 0) / rated.length;
  return `Daily completion over ${rated.length} days averaged ${percent(average)}; the best day was ${shortDate(best.date)} at ${percent(best.rate)}.`;
}

/**
 * The daily rate over the range as bars (plan 7.5), empty where a day had nothing due. It starts
 * at the first day with anything due, so a long range doesn't open on months before the first
 * habit.
 */
export function CompletionChart({ daily: all, headline }: { daily: Daily; headline?: ReactNode }) {
  const firstRated = all.findIndex((day) => day.rate !== null);
  const daily = firstRated === -1 ? all : all.slice(firstRated);
  const data = daily.map((day) => ({
    date: day.date,
    rate: day.rate === null ? null : Math.round(day.rate * 100),
  }));
  // A month or less reads as day numbers under each bar; longer ranges get dates now and then.
  const short = data.length <= 31;
  const barSize = Math.max(2, Math.min(8, Math.floor(480 / Math.max(data.length, 1)) - 6));

  return (
    <ChartCard
      title="Completion over time"
      headline={headline}
      summary={summaryOf(daily)}
      chart={
        <div className="h-64" aria-hidden="true">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 600, height: 256 }}
          >
            <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={short ? dayOfMonth : monthDay}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={short ? 6 : 24}
              />
              <YAxis
                orientation="right"
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', radius: 6 }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  if (!active || !point) {
                    return null;
                  }
                  return (
                    <div className="rounded-xl bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/5">
                      <div className="font-medium">{shortDate(point.date)}</div>
                      <div className="text-muted-foreground tabular-nums">
                        {point.rate === null ? 'Nothing due' : `${point.rate}%`}
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="rate"
                fill="var(--foreground)"
                radius={[999, 999, 0, 0]}
                barSize={barSize}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <StatTable
          caption="Completion by day"
          head={['Day', 'Completion']}
          rows={[...daily].reverse().map((day) => [shortDate(day.date), percent(day.rate)])}
        />
      }
    />
  );
}
