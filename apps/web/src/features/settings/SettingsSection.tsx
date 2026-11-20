import type { ReactNode } from 'react';
import { Section } from '@/components/Section';
import { cn } from '@/lib/utils';

/** A settings group: its title on the page, its controls in a white card under it. */
export function SettingsSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Section title={title} description={description}>
      <div className={cn('flex flex-col gap-5 rounded-3xl bg-card p-5 sm:p-7', className)}>
        {children}
      </div>
    </Section>
  );
}

/** One setting on a line: what it is (and a hint) on the left, its control on the right. */
export function SettingsRow({
  label,
  hint,
  labelId,
  children,
}: {
  label: string;
  hint?: ReactNode;
  labelId?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span id={labelId} className="text-[0.9375rem] font-medium">
          {label}
        </span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </div>
      <div className="shrink-0 sm:w-72">{children}</div>
    </div>
  );
}
