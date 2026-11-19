import type {
  LatestReviewDto,
  LocalDate,
  ReviewDto,
  ReviewListDto,
  UndoResult,
} from '@notch/shared';
import { api } from '@/lib/api-client';

export const REVIEW_PAGE_SIZE = 10;

export const reviewsApi = {
  /** Runs the week's review first if it's due. */
  latest: () => api.get<LatestReviewDto>('/reviews/latest'),
  get: (weekStart: LocalDate) => api.get<ReviewDto>(`/reviews/${weekStart}`),
  list: (cursor?: LocalDate) =>
    api.get<ReviewListDto>('/reviews', { query: { limit: REVIEW_PAGE_SIZE, cursor } }),
  seen: (id: string) => api.post<ReviewDto>(`/reviews/${id}/seen`),
  undo: (changeId: string) => api.post<UndoResult>(`/target-changes/${changeId}/undo`),
};
