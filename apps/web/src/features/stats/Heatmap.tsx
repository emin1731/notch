import type { CoreColor, HeatmapDay } from '@notch/shared';
import { useState } from 'react';
import { coreStyle } from '@/lib/core-colors';
import { formatValue } from '@/lib/habit-format';
import { shortDate } from '@/lib/stats-format';
import { cn } from '@/lib/utils';
import { ChartCard, StatTable } from './ChartCard';
import {
  type DayContext,
  dayLabel,
  dayStatus,
  heatLevel,
  heatmapWeeks,
  isBonus,
} from './heatmap-model';

const LEVEL_CLASS = {
  none: 'bg-muted',
  low: 'bg-(--core)/30',
  mid: 'bg-(--core)/60',
  hit: 'bg-(--core)',
} as const;

const ROW_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

/**
 * Every day of the window in the habit's core colour, stronger with more of the target done.
 * Unscheduled days are hollow and a bonus log adds a dot; each cell says all of it in words.
 */
export function Heatmap({
  days,
  color,
  context,
}: {
  days: readonly HeatmapDay[];
  color: CoreColor;
  context: DayContext;
}) {
  const [hovered, setHovered] = useState<HeatmapDay | null>(null);
  const weeks = heatmapWeeks(days);
  const small = weeks.length > 20;
  const cell = small ? 'size-3.5 rounded-[3px]' : 'size-6 rounded-md';
  const scheduled = days.filter((day) => day.scheduled);
  const hits = scheduled.filter((day) => day.hit).length;

  return (
    <ChartCard
      title="Calendar"
      summary={`${days.length} days from ${shortDate(days[0]?.date ?? '')}: ${hits} hit, ${days.filter(isBonus).length} bonus. Switch to the table for each day.`}
      chart={
        <div style={coreStyle(color)} className="flex flex-col gap-2">
          <div className="overflow-x-auto pb-1">
            <div className="flex w-max gap-1">
              <div className="flex flex-col gap-1 pt-5 pr-1" aria-hidden="true">
                {ROW_LABELS.map((label, index) => (
                  <span
                    key={index}
                    className={cn(
                      'flex items-center text-[10px] text-muted-foreground',
                      small ? 'h-3.5' : 'h-6',
                    )}
                  >
                    {label}
                  </span>
                ))}
              </div>
              {weeks.map((week) => (
                <div key={week.start} className="flex flex-col gap-1">
                  <span
                    className="h-4 text-[10px] whitespace-nowrap text-muted-foreground"
                    aria-hidden="true"
                  >
                    {week.month}
                  </span>
                  {week.days.map((day, index) =>
                    day ? (
                      <span
                        key={day.date}
                        role="img"
                        aria-label={dayLabel(day, context)}
                        onMouseEnter={() => setHovered(day)}
                        onMouseLeave={() => setHovered(null)}
                        className={cn(
                          cell,
                          'relative flex items-center justify-center',
                          day.scheduled
                            ? LEVEL_CLASS[heatLevel(day)]
                            : 'border border-(--core)/40 bg-transparent',
                          day.date === context.today &&
                            'ring-1 ring-foreground/40 ring-offset-1 ring-offset-card',
                        )}
                      >
                        {isBonus(day) && <span className="size-1 rounded-full bg-(--core)" />}
                      </span>
                    ) : (
                      <span key={index} className={cell} aria-hidden="true" />
                    ),
                  )}
                </div>
              ))}
            </div>
          </div>
          <p className="h-4 text-xs text-muted-foreground tabular-nums" aria-hidden="true">
            {hovered ? dayLabel(hovered, context) : ''}
          </p>
          <Legend />
        </div>
      }
      table={
        <StatTable
          caption="Each day"
          head={['Day', 'Logged', 'Target', 'Status']}
          rows={[...days]
            .reverse()
            .map((day) => [
              shortDate(day.date),
              context.habit.type === 'TOGGLE'
                ? day.value > 0
                  ? 'Yes'
                  : 'No'
                : formatValue(context.habit.type, day.value, context.habit.unit),
              context.habit.type === 'TOGGLE' || !day.scheduled
                ? '—'
                : formatValue(context.habit.type, day.target, context.habit.unit),
              dayStatus(day, context),
            ])}
        />
      }
    />
  );
}

function Legend() {
  const swatch = 'inline-block size-3 rounded-[3px]';
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
      aria-hidden="true"
    >
      <span className="flex items-center gap-1">
        Less
        <span className={cn(swatch, LEVEL_CLASS.none)} />
        <span className={cn(swatch, LEVEL_CLASS.low)} />
        <span className={cn(swatch, LEVEL_CLASS.mid)} />
        <span className={cn(swatch, LEVEL_CLASS.hit)} />
        More
      </span>
      <span className="flex items-center gap-1">
        <span className={cn(swatch, 'border border-(--core)/40')} />
        Not scheduled
      </span>
      <span className="flex items-center gap-1">
        <span className={cn(swatch, 'flex items-center justify-center border border-(--core)/40')}>
          <span className="size-1 rounded-full bg-(--core)" />
        </span>
        Bonus
      </span>
    </div>
  );
}
