import type { CoreColor } from '@notch/shared';
import { cn } from '@/lib/utils';
import { CoreIcon } from './CoreIcon';

/** A core's icon and name, e.g. above a goal's title. */
export function CoreChip({
  name,
  icon,
  color,
  className,
}: {
  name: string;
  icon: string;
  color: CoreColor;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2 text-sm font-medium', className)}>
      <CoreIcon icon={icon} color={color} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  );
}
