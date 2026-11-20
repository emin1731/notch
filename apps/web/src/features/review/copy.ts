import type { TargetChangeKind } from '@notch/shared';

/** Reviews' and target changes' words (plan section 14). */
export const REVIEW_COPY = {
  inactiveWeek: 'You were away last week. Nothing changed. Pick up where you left off.',
  noChanges: 'No targets changed this week. Solid weeks add up: keep going.',
} as const;

/** What a change's explanation ends on: credit for a level-up, reassurance for a deload. */
export function closingLine(kind: TargetChangeKind): string {
  if (kind === 'LEVEL_UP') {
    return "You've earned it.";
  }
  return kind === 'DELOAD' ? "This isn't a step back." : '';
}
