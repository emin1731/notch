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
        'flex shrink-0 items-center justify-center bg-(--core)/12 text-(--core)',
        size === 'sm' && 'size-7 rounded-lg [&>svg]:size-4',
        size === 'md' && 'size-10 rounded-xl [&>svg]:size-5',
        size === 'lg' && 'size-11 rounded-xl [&>svg]:size-5',
        className,
      )}
    >
      {/* A lookup in a fixed map, not a component created per render. */}
      {createElement(coreIcon(icon))}
    </span>
  );
}
