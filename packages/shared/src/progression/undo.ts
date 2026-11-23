import type { TargetChangeKind, TargetField } from '../enums.js';

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
 * effect), with no log at the new level yet, and no edit to the habit since. `editedSince` comes
 * from `hasLaterChange`: an edit set back by hand on another day leaves the value as it was, but
 * its changes would still say otherwise.
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
    editedSince,
    currentValue,
  }: { now: Date; hasLogSinceEffective: boolean; editedSince: boolean; currentValue: number },
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
  if (editedSince || currentValue !== change.toValue) {
    return 'CHANGED_SINCE';
  }
  return null;
}

interface ChangeStamp {
  id: string;
  field: TargetField;
  createdAt: Date;
  undoneAt: Date | null;
}

/** Whether `changes` (the habit's) has a change of the same field made after `change`. */
export function hasLaterChange(change: ChangeStamp, changes: readonly ChangeStamp[]): boolean {
  return changes.some(
    (other) =>
      other.id !== change.id &&
      other.field === change.field &&
      other.undoneAt === null &&
      other.createdAt.getTime() > change.createdAt.getTime(),
  );
}
