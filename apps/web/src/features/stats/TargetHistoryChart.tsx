import type { HabitStatsDto, TargetChangeDto } from '@notch/shared';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { changeArrow, changeValue, changeValues, type HabitUnits } from '@/lib/change-format';
import { shortDate } from '@/lib/stats-format';
import { ChartCard, StatTable } from './ChartCard';
import { changesInWindow } from './stats-model';

type Field = HabitStatsDto['field'];

const KIND_TEXT = { LEVEL_UP: 'Levelled up', DELOAD: 'Eased off', MANUAL: 'Edited' } as const;

const time = (date: string) => Date.parse(`${date}T00:00:00Z`);
const monthDay = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const axisTick = { fill: 'var(--muted-foreground)', fontSize: 12 };

/**
 * The target over the window as steps (plan 7.5): ↑ for level-ups, ↓ for deloads, faded when
 * undone. Values read in the habit's terms (minutes, not seconds).
 */
export function TargetHistoryChart({
  stats,
  history,
  habit,
}: {
  stats: Pick<HabitStatsDto, 'field' | 'from' | 'to' | 'targetSeries'>;
  history: readonly TargetChangeDto[];
  habit: HabitUnits;
}) {
  const field: Field = stats.field;
  const like = (value: number) => ({
    field,
    kind: 'MANUAL' as const,
    fromValue: value,
    toValue: value,
  });
  const say = (value: number) => changeValue(like(value), habit, value);
  const plot = (value: number) =>
    field === 'TARGET_VALUE' && habit.type === 'DURATION' ? Math.round(value / 60) : value;

  const changes = changesInWindow(history, stats);
  const series = stats.targetSeries;
  const first = series[0];
  const last = series[series.length - 1];
  if (!first || !last) {
    return null;
  }
  if (changes.length === 0) {
    return (
      <section className="flex flex-col gap-1 rounded-xl border bg-card p-4">
        <h2 className="font-medium">Target over time</h2>
        <p className="text-sm text-muted-foreground">
          This target hasn&apos;t changed in this range: {say(first.target)} throughout.
        </p>
      </section>
    );
  }

  const data = [
    ...series,
    ...(last.date < stats.to ? [{ date: stats.to, target: last.target }] : []),
  ].map((point) => ({ t: time(point.date), date: point.date, target: plot(point.target) }));
  const ups = changes.filter((change) => change.kind === 'LEVEL_UP' && !change.undoneAt).length;
  const downs = changes.filter((change) => change.kind === 'DELOAD' && !change.undoneAt).length;
  const undone = changes.filter((change) => change.undoneAt).length;

  return (
    <ChartCard
      title="Target over time"
      summary={`From ${say(first.target)} to ${say(last.target)}: ${ups} level-ups, ${downs} deloads${undone ? `, ${undone} undone` : ''}.`}
      chart={
        <div className="h-48" aria-hidden="true">
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 600, height: 192 }}
          >
            <LineChart data={data} margin={{ top: 20, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={[time(stats.from), time(stats.to)]}
                tickFormatter={monthDay}
                tick={axisTick}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                domain={['auto', 'auto']}
                allowDecimals={false}
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
                        {say(
                          series.findLast((step) => step.date <= point.date)?.target ??
                            first.target,
                        )}
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                type="stepAfter"
                dataKey="target"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {changes.map((change) => (
                <ReferenceDot
                  key={change.id}
                  x={time(change.effectiveFrom)}
                  y={plot(change.toValue)}
                  r={change.kind === 'MANUAL' ? 3 : 4}
                  fill={change.kind === 'DELOAD' ? 'var(--muted-foreground)' : 'var(--primary)'}
                  stroke="var(--card)"
                  fillOpacity={change.undoneAt ? 0.35 : 1}
                  label={
                    change.kind === 'MANUAL'
                      ? undefined
                      : {
                          value: changeArrow(change.kind),
                          position: 'top',
                          fill: 'var(--foreground)',
                          fontSize: 12,
                          opacity: change.undoneAt ? 0.35 : 1,
                        }
                  }
                  ifOverflow="extendDomain"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      }
      table={
        <StatTable
          caption="Target changes"
          head={['Day', 'Target', 'What happened']}
          rows={[
            ...[...changes]
              .reverse()
              .map((change) => [
                shortDate(change.effectiveFrom),
                changeValues(change, habit),
                `${KIND_TEXT[change.kind]}${change.undoneAt ? ' (undone)' : ''}`,
              ]),
            [shortDate(first.date), say(first.target), 'Start of the range'],
          ]}
        />
      }
    />
  );
}
