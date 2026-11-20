import type { StatsRange } from '@notch/shared';
import type { ReactNode } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { cn } from '@/lib/utils';

const RANGE_LABELS: Record<StatsRange, string> = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  '365d': '1 year',
};

/** The range switch for a stats page. */
export function RangeControl<T extends StatsRange>({
  ranges,
  value,
  onChange,
  surface = true,
}: {
  ranges: readonly T[];
  value: T;
  onChange: (range: T) => void;
  /** On the page (the default) rather than in a card. */
  surface?: boolean;
}) {
  return (
    <>
      <span id="range-label" className="sr-only">
        Range
      </span>
      <SegmentedControl
        value={value}
        onChange={onChange}
        options={ranges.map((range) => ({ value: range, label: RANGE_LABELS[range] }))}
        aria-labelledby="range-label"
        surface={surface}
      />
    </>
  );
}

/** One key number: goes in a `<dl>`. */
export function Kpi({
  label,
  value,
  valueLabel,
  detail,
}: {
  label: string;
  value: string;
  /** What `value` says, when its symbols don't read well aloud. */
  valueLabel?: string;
  detail?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-3xl bg-card p-5 sm:p-6">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-3xl font-bold tracking-tight tabular-nums" aria-label={valueLabel}>
        {value}
      </dd>
      {detail && <dd className="truncate text-sm text-muted-foreground">{detail}</dd>}
    </div>
  );
}

/** A white card with its name as a small muted label (and an optional note on the right). */
export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn('flex min-w-0 flex-col gap-4 rounded-3xl bg-card p-5 sm:p-7', className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[0.9375rem] text-muted-foreground">{title}</h2>
        {aside && <span className="text-sm text-muted-foreground">{aside}</span>}
      </div>
      {children}
    </section>
  );
}
