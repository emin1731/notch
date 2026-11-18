import type {
  CreateGoalInput,
  GoalChangeResult,
  GoalDetailDto,
  GoalDto,
  MilestoneChangeResult,
  MilestoneDto,
  UpdateGoalInput,
} from '@notch/shared';
import { api } from '@/lib/api-client';

export const goalsApi = {
  list: (includeArchived: boolean) => api.get<GoalDto[]>('/goals', { query: { includeArchived } }),
  get: (id: string) => api.get<GoalDetailDto>(`/goals/${id}`),
  create: (input: CreateGoalInput) => api.post<GoalDetailDto>('/goals', input),
  update: (id: string, input: UpdateGoalInput) => api.patch<GoalDetailDto>(`/goals/${id}`, input),
  complete: (id: string) => api.post<GoalDetailDto>(`/goals/${id}/complete`),
  reopen: (id: string) => api.post<GoalDetailDto>(`/goals/${id}/reopen`),
  archive: (id: string) => api.post<GoalDetailDto>(`/goals/${id}/archive`),
  unarchive: (id: string) => api.post<GoalDetailDto>(`/goals/${id}/unarchive`),
  delete: (id: string) => api.delete<void>(`/goals/${id}`),
};

export const milestonesApi = {
  create: (goalId: string, title: string) =>
    api.post<MilestoneChangeResult>(`/goals/${goalId}/milestones`, { title }),
  rename: (id: string, title: string) => api.patch<MilestoneDto>(`/milestones/${id}`, { title }),
  toggle: (id: string) => api.post<MilestoneChangeResult>(`/milestones/${id}/toggle`),
  /** Every milestone of the goal, exactly once. */
  order: (goalId: string, ids: string[]) =>
    api.put<MilestoneDto[]>(`/goals/${goalId}/milestones/order`, { ids }),
  delete: (id: string) => api.delete<GoalChangeResult>(`/milestones/${id}`),
};
