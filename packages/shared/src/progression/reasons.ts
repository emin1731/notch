import type { DecisionReason } from './decide.js';
import type { UndoBlockReason } from './undo.js';

/** Plain sentences for the review screen and the change popover (tone guide: calm, no guilt). */
export const DECISION_REASON_TEXT: Record<DecisionReason, string> = {
  NOT_ELIGIBLE: 'Not enough data this week',
  NOT_ADAPTIVE: "This habit doesn't adjust automatically",
  INACTIVE_WEEK: 'A quiet week, so nothing changed',
  COOLDOWN: 'Holding steady after your undo',
  AT_MAX: 'Already at your maximum',
  AT_MIN: 'Already at your minimum',
  CONSISTENT: 'Two strong weeks in a row',
  STRUGGLING: 'A tough week, so this got a little easier',
  STEADY: 'Keeping the same level',
};

export const UNDO_BLOCK_REASON_TEXT: Record<UndoBlockReason, string> = {
  NOT_AUTOMATIC: 'Only automatic changes can be undone',
  ALREADY_UNDONE: 'Already undone',
  EXPIRED: 'Undo was available until the end of that week',
  ALREADY_LOGGED: "You've already logged at the new target, so this one's locked in",
  CHANGED_SINCE: 'You changed this habit yourself since then',
};
