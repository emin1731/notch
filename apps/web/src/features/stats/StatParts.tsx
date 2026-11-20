import type { StatsRange } from '@notch/shared';
import type { ReactNode } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';

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
}: {
  ranges: readonly T[];
  value: T;
  onChange: (range: T) => void;
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
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl border bg-card p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums" aria-label={valueLabel}>
        {value}
      </dd>
      {detail && <dd className="truncate text-xs text-muted-foreground">{detail}</dd>}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="font-medium">{title}</h2>
      {children}
    </section>
  );
}
