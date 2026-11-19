import type { HabitStatsDto, TargetChangeDto } from '@notch/shared';

/** The changes to `field` that took effect inside the window, oldest first, undone ones too. */
export function changesInWindow(
  history: readonly TargetChangeDto[],
  stats: Pick<HabitStatsDto, 'field' | 'from' | 'to'>,
): TargetChangeDto[] {
  return history.filter(
    (change) =>
      change.field === stats.field &&
      change.effectiveFrom >= stats.from &&
      change.effectiveFrom <= stats.to,
  );
}

/** Level-ups that took effect in the window and weren't undone: the habit page's count. */
export const levelUpsInWindow = (
  history: readonly TargetChangeDto[],
  stats: Pick<HabitStatsDto, 'field' | 'from' | 'to'>,
) =>
  changesInWindow(history, stats).filter((change) => change.kind === 'LEVEL_UP' && !change.undoneAt)
    .length;
