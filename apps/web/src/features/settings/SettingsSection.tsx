import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

/** One settings card: a title, an optional line under it, and its controls. */
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
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn('flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-6', className)}
    >
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className="font-medium">
          {title}
        </h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
