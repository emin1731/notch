import type { CoreColor } from '../constants.js';
import type { LocalDate } from '../dates/local-date.js';
import type { GoalStatus } from '../goals/goal-progress.js';

export interface CoreDto {
  id: string;
  name: string;
  color: CoreColor;
  icon: string;
  sortOrder: number;
  archivedAt: string | null;
  /** Non-archived goals. */
  counts: { goals: number };
}

export interface MilestoneDto {
  id: string;
  goalId: string;
  title: string;
  sortOrder: number;
  completedAt: string | null;
}

export interface GoalDto {
  id: string;
  coreId: string;
  title: string;
  description: string | null;
  deadline: LocalDate | null;
  status: GoalStatus;
  completedAt: string | null;
  archivedAt: string | null;
  sortOrder: number;
  /** 0..1, or null without milestones. */
  progress: number | null;
  milestoneCounts: { done: number; total: number };
}

export interface GoalDetailDto extends GoalDto {
  milestones: MilestoneDto[];
}

/** Returned by milestone deletion: the goal's status may have changed. */
export interface GoalChangeResult {
  goal: GoalDto;
  /** True when this change completed the goal: the client shows the celebration. */
  goalJustCompleted: boolean;
}

/** Returned by milestone create and toggle. */
export interface MilestoneChangeResult extends GoalChangeResult {
  milestone: MilestoneDto;
}
