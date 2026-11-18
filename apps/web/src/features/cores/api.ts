import type { CoreDto, CreateCoreInput, UpdateCoreInput } from '@notch/shared';
import { api } from '@/lib/api-client';

export const coresApi = {
  list: (includeArchived: boolean) => api.get<CoreDto[]>('/cores', { query: { includeArchived } }),
  create: (input: CreateCoreInput) => api.post<CoreDto>('/cores', input),
  update: (id: string, input: UpdateCoreInput) => api.patch<CoreDto>(`/cores/${id}`, input),
  /** The listed cores first, in this order; the rest keep theirs after them. */
  order: (ids: string[]) => api.put<CoreDto[]>('/cores/order', { ids }),
  archive: (id: string) => api.post<CoreDto>(`/cores/${id}/archive`),
  unarchive: (id: string) => api.post<CoreDto>(`/cores/${id}/unarchive`),
  delete: (id: string) => api.delete<void>(`/cores/${id}`),
};
