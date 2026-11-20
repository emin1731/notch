import { type ReactNode, useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * A titled block of the page: the title (and a muted line, and an action such as "View all") sit
 * on the page, above the card or list they introduce. Its region is named by the title.
 */
export function Section({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-end justify-between gap-3 px-1">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={titleId} className="text-xl font-semibold tracking-tight">
            {title}
          </h2>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
