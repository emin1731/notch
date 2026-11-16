import {
  type GoalDetailDto,
  type GoalDto,
  goalProgress,
  type MilestoneDto,
  toDateString,
} from '@notch/shared';
import type { Goal, Milestone } from '../generated/prisma/client.js';

export function toMilestoneDto(milestone: Milestone): MilestoneDto {
  return {
    id: milestone.id,
    goalId: milestone.goalId,
    title: milestone.title,
    sortOrder: milestone.sortOrder,
    completedAt: milestone.completedAt?.toISOString() ?? null,
  };
}

/** `milestones` only needs `completedAt`, for the progress. */
export function toGoalDto(
  goal: Goal,
  milestones: readonly { completedAt: Date | null }[],
): GoalDto {
  const { done, total, progress } = goalProgress(milestones);
  return {
    id: goal.id,
    coreId: goal.coreId,
    title: goal.title,
    description: goal.description,
    deadline: goal.deadline ? toDateString(goal.deadline) : null,
    status: goal.status,
    completedAt: goal.completedAt?.toISOString() ?? null,
    archivedAt: goal.archivedAt?.toISOString() ?? null,
    sortOrder: goal.sortOrder,
    progress,
    milestoneCounts: { done, total },
  };
}

/** `milestones` must be in display order. */
export function toGoalDetailDto(goal: Goal, milestones: readonly Milestone[]): GoalDetailDto {
  return { ...toGoalDto(goal, milestones), milestones: milestones.map(toMilestoneDto) };
}
