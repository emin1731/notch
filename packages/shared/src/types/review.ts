import type { LocalDate } from '../dates/local-date.js';
import type { Decision, DecisionReason } from '../progression/decide.js';
import type { HabitDto, TargetChangeDto } from './habit.js';

/** Stored on each review (plan 5.3): a snapshot, so later renames don't rewrite it. */
export interface WeeklyReviewSummary {
  weekStart: LocalDate;
  /** Average rate of the habits with an eligible week. */
  overallRate: number | null;
  habits: {
    habitId: string;
    name: string;
    coreId: string;
    rate: number | null;
    previousRate: number | null;
    decision: Decision;
    reason: DecisionReason;
    targetChangeId?: string;
  }[];
}

export interface ReviewChangeDto extends TargetChangeDto {
  habitName: string;
  canUndo: boolean;
}

export interface ReviewDto {
  id: string;
  weekStart: LocalDate;
  inactive: boolean;
  seenAt: string | null;
  createdAt: string;
  summary: WeeklyReviewSummary;
  changes: ReviewChangeDto[];
}

export interface ReviewListDto {
  items: ReviewDto[];
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: LocalDate | null;
}

/** `review` is null until the first week has been reviewed. */
export interface LatestReviewDto {
  review: ReviewDto | null;
}

export interface UndoResult {
  change: TargetChangeDto;
  habit: HabitDto;
}
