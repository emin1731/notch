import type { LocalDate } from '../dates/local-date.js';
import { addDays } from '../dates/week.js';
import type { TargetChangeKind } from '../enums.js';
import type { HabitHistory } from '../progress/history.js';
import type { ChangeLite } from './history.js';

/**
 * Plan 2.7: a week counts for levelling only if the habit existed for all of it and nothing about
 * it changed during it. A change taking effect on the Monday (last review's level-up, or an edit
 * made that day) leaves the whole week at one value, so it doesn't count. Undone changes never do.
 */
export function isEligibleWeek(history: HabitHistory, weekStart: LocalDate): boolean {
  if (history.schedule.startDate > weekStart) {
    return false;
  }
  const weekEnd = addDays(weekStart, 6);
  return !history.changes.some(
    (change) =>
      !change.undone && change.effectiveFrom > weekStart && change.effectiveFrom <= weekEnd,
  );
}

/**
 * A change of `kind` undone during the previous review cycle blocks another change of that kind in
 * this review. The previous review's changes take effect on the Monday of the week under review.
 */
export function isUnderCooldown(
  changes: readonly ChangeLite[],
  kind: Exclude<TargetChangeKind, 'MANUAL'>,
  weekStart: LocalDate,
): boolean {
  return changes.some(
    (change) => change.undone && change.kind === kind && change.effectiveFrom === weekStart,
  );
}
