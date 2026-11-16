import {
  type GoalDetailDto,
  type GoalDto,
  goalProgress,
  type MilestoneDto,
  toDateString,
} from '@notch/shared';
import type { Goal, Habit, Milestone } from '../generated/prisma/client.js';

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

type LinkedHabit = Pick<Habit, 'id' | 'name' | 'type' | 'archivedAt'>;

/** `milestones` and `habits` must be in display order. */
export function toGoalDetailDto(
  goal: Goal,
  milestones: readonly Milestone[],
  habits: readonly LinkedHabit[],
): GoalDetailDto {
  return {
    ...toGoalDto(goal, milestones),
    milestones: milestones.map(toMilestoneDto),
    habits: habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      type: habit.type,
      archivedAt: habit.archivedAt?.toISOString() ?? null,
    })),
  };
}
