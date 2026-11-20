import type {
  CreateHabitInput,
  HabitDetailDto,
  HabitDto,
  TargetChangeDto,
  UpdateHabitInput,
} from '@notch/shared';
import { api } from '@/lib/api-client';

export const habitsApi = {
  list: (includeArchived: boolean) =>
    api.get<HabitDto[]>('/habits', { query: { includeArchived } }),
  get: (id: string) => api.get<HabitDetailDto>(`/habits/${id}`),
  create: (input: CreateHabitInput) => api.post<HabitDetailDto>('/habits', input),
  update: (id: string, input: UpdateHabitInput) =>
    api.patch<HabitDetailDto>(`/habits/${id}`, input),
  archive: (id: string) => api.post<HabitDetailDto>(`/habits/${id}/archive`),
  unarchive: (id: string) => api.post<HabitDetailDto>(`/habits/${id}/unarchive`),
  delete: (id: string) => api.delete<void>(`/habits/${id}`),
  /** The listed habits first, in this order; the rest keep theirs after them. */
  order: (ids: string[]) => api.put<HabitDto[]>('/habits/order', { ids }),
  /** Every target change, oldest first, undone ones included. */
  targetHistory: (id: string) => api.get<TargetChangeDto[]>(`/habits/${id}/target-history`),
};
