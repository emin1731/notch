import type { TargetChangeKind } from '../enums.js';

export const UNDO_BLOCK_REASONS = [
  'NOT_AUTOMATIC',
  'ALREADY_UNDONE',
  'EXPIRED',
  'ALREADY_LOGGED',
  'CHANGED_SINCE',
] as const;
export type UndoBlockReason = (typeof UNDO_BLOCK_REASONS)[number];

/**
 * Why a target change can't be undone, or null when it can (plan 2.8, 6.5):
 * only automatic changes, not already undone, before the deadline (the end of the week it took
 * effect), with no log at the new level yet, and no edit to the habit since.
 */
export function undoBlockReason(
  change: {
    kind: TargetChangeKind;
    toValue: number;
    undoneAt: Date | null;
    undoDeadline: Date | null;
  },
  {
    now,
    hasLogSinceEffective,
    currentValue,
  }: { now: Date; hasLogSinceEffective: boolean; currentValue: number },
): UndoBlockReason | null {
  if (change.kind === 'MANUAL' || change.undoDeadline === null) {
    return 'NOT_AUTOMATIC';
  }
  if (change.undoneAt !== null) {
    return 'ALREADY_UNDONE';
  }
  if (now.getTime() >= change.undoDeadline.getTime()) {
    return 'EXPIRED';
  }
  if (hasLogSinceEffective) {
    return 'ALREADY_LOGGED';
  }
  if (currentValue !== change.toValue) {
    return 'CHANGED_SINCE';
  }
  return null;
}
