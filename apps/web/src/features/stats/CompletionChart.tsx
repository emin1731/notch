import type { StatsOverviewDto } from '@notch/shared';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { percent, shortDate } from '@/lib/stats-format';
import { ChartCard, StatTable } from './ChartCard';

type Daily = StatsOverviewDto['daily'];

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
 * The daily rate over the range: a gap where a day had nothing due (plan 7.5). It starts at the
 * first day with anything due, so a long range doesn't open on months before the first habit.
 */
export function CompletionChart({ daily: all }: { daily: Daily }) {
  const firstRated = all.findIndex((day) => day.rate !== null);
  const daily = firstRated === -1 ? all : all.slice(firstRated);
  const data = daily.map((day) => ({
    date: day.date,
    rate: day.rate === null ? null : Math.round(day.rate * 100),
  }));
  return (
    <ChartCard
      title="Completion over time"
      summary={summaryOf(daily)}
      chart={
        <div className="h-52" aria-hidden="true">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 600, height: 208 }}
          >
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tickFormatter={monthDay}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={[0, 100]}
                ticks={[0, 50, 100]}
                tickFormatter={(value: number) => `${value}%`}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border)' }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as (typeof data)[number] | undefined;
                  if (!active || !point) {
                    return null;
                  }
                  return (
                    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-sm">
                      <div className="font-medium">{shortDate(point.date)}</div>
                      <div className="tabular-nums">
                        {point.rate === null ? 'Nothing due' : `${point.rate}%`}
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                type="linear"
                dataKey="rate"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={data.length <= 31 ? { r: 2, fill: 'var(--primary)' } : false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
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
