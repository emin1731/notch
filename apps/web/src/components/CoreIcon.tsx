import type { CoreColor } from '@notch/shared';
import { createElement } from 'react';
import { coreStyle } from '@/lib/core-colors';
import { coreIcon } from '@/lib/core-icons';
import { cn } from '@/lib/utils';

/** A core's icon on a tinted tile in its color. */
export function CoreIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  icon: string;
  color: CoreColor;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      style={coreStyle(color)}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-(--core)/15 text-(--core)',
        size === 'sm' && 'size-6 [&>svg]:size-3.5',
        size === 'md' && 'size-8 [&>svg]:size-4',
        size === 'lg' && 'size-10 [&>svg]:size-5',
        className,
      )}
    >
      {/* A lookup in a fixed map, not a component created per render. */}
      {createElement(coreIcon(icon))}
    </span>
  );
}
