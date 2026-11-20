import { ChartColumn, Table2 } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { cn } from '@/lib/utils';

type View = 'chart' | 'table';

const VIEWS = [
  { value: 'chart', label: 'Chart', icon: ChartColumn },
  { value: 'table', label: 'Table', icon: Table2 },
] as const;

/**
 * A chart with its numbers one switch away, so nothing depends on seeing it. `summary` is the
 * chart's gist for screen readers.
 */
export function ChartCard({
  title,
  headline,
  summary,
  chart,
  table,
  className,
}: {
  title: string;
  /** A big number (and its line) above the chart, as on a dashboard. */
  headline?: ReactNode;
  summary: string;
  chart: ReactNode;
  table: ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<View>('chart');
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex min-w-0 flex-col gap-5 rounded-3xl bg-card p-5 sm:p-7', className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
          <h2 id={titleId} className="text-[0.9375rem] text-muted-foreground">
            {title}
          </h2>
          {headline}
        </div>
        <SegmentedControl
          value={view}
          onChange={setView}
          options={VIEWS}
          aria-labelledby={titleId}
          className="shrink-0"
        />
      </div>
      {view === 'chart' ? (
        <>
          <p className="sr-only">{summary}</p>
          {chart}
        </>
      ) : (
        table
      )}
    </section>
  );
}

/** A plain data table, scrolling inside its card when long. */
export function StatTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}) {
  return (
    <div className="max-h-80 overflow-auto rounded-2xl bg-muted/50">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="px-4 py-2.5 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, column) => (
                <td key={column} className="px-4 py-2 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
