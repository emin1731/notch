import type { CoreColor } from '@notch/shared';

/**
 * A core's accent as a CSS value (`--core-<color>` in styles.css, lighter in dark mode).
 * Use it through a `--core` custom property: `style={coreStyle(color)}` + `bg-(--core)`.
 */
export const coreColor = (color: CoreColor): string => `var(--core-${color})`;

export const coreStyle = (color: CoreColor) =>
  ({ '--core': coreColor(color) }) as React.CSSProperties;
