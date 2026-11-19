import type { LocalDate } from '../dates/local-date.js';
import type { CoreColor } from '../constants.js';
import type { HabitType, ScheduleType, TargetChangeKind, TimeOfDay } from '../enums.js';
import type { UndoBlockReason } from '../progression/undo.js';

export interface LogDto {
  date: LocalDate;
  /** Toggle 0/1, count units, duration seconds. */
  value: number;
  targetSnapshot: number;
}

/** Returned by every log write, so the client can reconcile its optimistic update. */
export interface LogWriteResult {
  /** null when the write left nothing (a value of 0 deletes the log). */
  log: LogDto | null;
  habitProgress: number;
  currentStreak: number;
  longestStreak: number;
}

export interface TodayHabit {
  id: string;
  name: string;
  type: HabitType;
  unit: string | null;
  scheduleType: ScheduleType;
  timeOfDay: TimeOfDay;
  core: { id: string; name: string; color: CoreColor; icon: string };
  goal: { id: string; title: string } | null;
  /** The target in effect on the date. */
  target: number;
  log: { value: number; targetSnapshot: number } | null;
  /** 0..1 */
  progress: number;
  currentStreak: number;
  /** TIMES_PER_WEEK only: hit days so far this week against the quota. */
  week?: { hits: number; quota: number };
  /** A level-up or deload this week (from S5). */
  change?: {
    id: string;
    kind: Exclude<TargetChangeKind, 'MANUAL'>;
    field: 'TARGET_VALUE' | 'TIMES_PER_WEEK';
    fromValue: number;
    toValue: number;
    canUndo: boolean;
    /** Why it can't be undone (`UNDO_BLOCK_REASON_TEXT`), or null when it can. */
    undoBlockedReason: UndoBlockReason | null;
  };
}

export interface TodayResponse {
  date: LocalDate;
  /** Average progress of the daily and specific-day habits due on the date; null if none are. */
  dayProgress: number | null;
  pendingReview: { id: string; weekStart: LocalDate } | null;
  welcomeBack: boolean;
  /** Daily and specific-day habits due on the date, by time of day. Empty groups are left out. */
  groups: { timeOfDay: TimeOfDay; habits: TodayHabit[] }[];
  /** TIMES_PER_WEEK habits, with this week's progress. */
  weeklyQuota: TodayHabit[];
}
