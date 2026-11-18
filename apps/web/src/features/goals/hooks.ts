import {
  type CreateGoalInput,
  type GoalDetailDto,
  type GoalDto,
  goalProgress,
  type MilestoneDto,
  nextGoalStatus,
  type UpdateGoalInput,
} from '@notch/shared';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/forms';
import { invalidate, queryKeys } from '@/lib/query-keys';
import { goalsApi, milestonesApi } from './api';

export function useGoals(includeArchived: boolean) {
  return useQuery({
    queryKey: queryKeys.goals.list({ includeArchived }),
    queryFn: () => goalsApi.list(includeArchived),
  });
}

export function useGoal(id: string) {
  return useQuery({ queryKey: queryKeys.goal(id), queryFn: () => goalsApi.get(id) });
}

/** A goal mutation's result is the whole goal: show it at once, then refresh the lists. */
function storeGoal(client: QueryClient, goal: GoalDetailDto) {
  client.setQueryData(queryKeys.goal(goal.id), goal);
  return invalidate.goalChange(client, { goalId: goal.id });
}

export function useCreateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => goalsApi.create(input),
    onSuccess: (goal) => storeGoal(client, goal),
  });
}

export function useUpdateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGoalInput }) =>
      goalsApi.update(id, input),
    // A goal that moved core takes its habits along.
    onSuccess: (goal) => Promise.all([storeGoal(client, goal), invalidate.habitChange(client, {})]),
  });
}

type GoalAction = 'complete' | 'reopen' | 'archive' | 'unarchive';

export function useGoalAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: GoalAction }) => goalsApi[action](id),
    onSuccess: (goal) => storeGoal(client, goal),
  });
}

export function useDeleteGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => goalsApi.delete(id),
    // The goal's own query is left alone: its page is still showing until it navigates away.
    onSuccess: () =>
      Promise.all([invalidate.goalChange(client), invalidate.habitChange(client, {})]),
  });
}

/** The goal's own fields from a milestone change, merged into the cached detail. */
function mergeGoal(
  client: QueryClient,
  goal: GoalDto,
  milestones?: (m: MilestoneDto[]) => MilestoneDto[],
) {
  client.setQueryData<GoalDetailDto>(queryKeys.goal(goal.id), (detail) =>
    detail
      ? {
          ...detail,
          ...goal,
          milestones: milestones ? milestones(detail.milestones) : detail.milestones,
        }
      : detail,
  );
}

/** What ticking or unticking does to the goal, worked out the same way the server does. */
export function withMilestoneToggled(
  detail: GoalDetailDto,
  milestoneId: string,
  now: Date,
): GoalDetailDto {
  const milestones = detail.milestones.map((milestone) =>
    milestone.id === milestoneId
      ? { ...milestone, completedAt: milestone.completedAt ? null : now.toISOString() }
      : milestone,
  );
  const { done, total, progress } = goalProgress(milestones);
  const status = nextGoalStatus(detail.status, done, total);
  return {
    ...detail,
    milestones,
    progress,
    milestoneCounts: { done, total },
    status,
    completedAt: status === 'COMPLETED' ? (detail.completedAt ?? now.toISOString()) : null,
  };
}

/**
 * Ticks or unticks at once (plan 7.3's approach); rolls back with a toast if the server says no.
 * Resolves with `goalJustCompleted` from the server, the only thing that opens the celebration.
 */
export function useToggleMilestone(goalId: string) {
  const client = useQueryClient();
  const queryKey = queryKeys.goal(goalId);
  return useMutation({
    mutationFn: (milestoneId: string) => milestonesApi.toggle(milestoneId),
    onMutate: async (milestoneId) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<GoalDetailDto>(queryKey);
      if (previous) {
        client.setQueryData(queryKey, withMilestoneToggled(previous, milestoneId, new Date()));
      }
      return { previous };
    },
    onError: (error, _id, context) => {
      client.setQueryData(queryKey, context?.previous);
      toast.error(`Couldn't save that. ${apiErrorMessage(error)}`);
    },
    onSuccess: ({ goal, milestone }) =>
      mergeGoal(client, goal, (milestones) =>
        milestones.map((m) => (m.id === milestone.id ? milestone : m)),
      ),
    onSettled: () => invalidate.milestoneToggle(client, { goalId }),
  });
}

export function useAddMilestone(goalId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => milestonesApi.create(goalId, title),
    onSuccess: ({ goal, milestone }) => {
      mergeGoal(client, goal, (milestones) => [...milestones, milestone]);
      return invalidate.milestoneToggle(client, { goalId });
    },
  });
}

export function useRenameMilestone(goalId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => milestonesApi.rename(id, title),
    onSuccess: (milestone) => {
      client.setQueryData<GoalDetailDto>(
        queryKeys.goal(goalId),
        (detail) =>
          detail && {
            ...detail,
            milestones: detail.milestones.map((m) => (m.id === milestone.id ? milestone : m)),
          },
      );
    },
  });
}

export function useDeleteMilestone(goalId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => milestonesApi.delete(id),
    onSuccess: ({ goal }, id) => {
      mergeGoal(client, goal, (milestones) => milestones.filter((m) => m.id !== id));
      return invalidate.milestoneToggle(client, { goalId });
    },
  });
}

/** Moves the milestones at once; puts them back, with a toast, if the server says no. */
export function useReorderMilestones(goalId: string) {
  const client = useQueryClient();
  const queryKey = queryKeys.goal(goalId);
  return useMutation({
    mutationFn: (ids: string[]) => milestonesApi.order(goalId, ids),
    onMutate: async (ids) => {
      await client.cancelQueries({ queryKey });
      const previous = client.getQueryData<GoalDetailDto>(queryKey);
      if (previous) {
        const byId = new Map(previous.milestones.map((m) => [m.id, m]));
        client.setQueryData<GoalDetailDto>(queryKey, {
          ...previous,
          milestones: ids.map((id) => byId.get(id)).filter((m) => m !== undefined),
        });
      }
      return { previous };
    },
    onError: (error, _ids, context) => {
      client.setQueryData(queryKey, context?.previous);
      toast.error(`Couldn't save the new order. ${apiErrorMessage(error)}`);
    },
    onSuccess: (milestones) => {
      client.setQueryData<GoalDetailDto>(queryKey, (detail) => detail && { ...detail, milestones });
    },
  });
}
