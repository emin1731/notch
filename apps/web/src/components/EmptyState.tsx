import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
          <Icon className="size-6" aria-hidden="true" />
        </div>
      )}
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
