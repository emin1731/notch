import {
  type LocalDate,
  UNDO_BLOCK_REASON_TEXT,
  UNDO_BLOCK_REASONS,
  type UndoBlockReason,
} from '@notch/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { isApiError } from '@/lib/api-client';
import { apiErrorMessage } from '@/lib/forms';
import { invalidate, queryKeys } from '@/lib/query-keys';
import { reviewsApi } from './api';

export function useLatestReview({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.reviews.latest, queryFn: reviewsApi.latest, enabled });
}

export function useReview(weekStart: LocalDate) {
  return useQuery({
    queryKey: queryKeys.reviews.week(weekStart),
    queryFn: () => reviewsApi.get(weekStart),
  });
}

export function useReviewList() {
  return useInfiniteQuery({
    queryKey: queryKeys.reviews.list,
    queryFn: ({ pageParam }) => reviewsApi.list(pageParam),
    initialPageParam: undefined as LocalDate | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Opening a review marks it seen: Today's banner goes. */
export function useMarkSeen() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reviewsApi.seen(id),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.today.all }),
        client.invalidateQueries({ queryKey: queryKeys.reviews.all }),
      ]),
  });
}

const isUndoBlockReason = (value: unknown): value is UndoBlockReason =>
  (UNDO_BLOCK_REASONS as readonly unknown[]).includes(value);

/**
 * Undoes a level-up or deload. `done` is the toast on success (plan 14: "Back to 10 min…"). A
 * refused undo says why, in the same words as the badge.
 */
export function useUndoChange() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ changeId }: { changeId: string; done: string }) => reviewsApi.undo(changeId),
    onSuccess: (result, { done }) => {
      toast.success(done);
      return invalidate.undo(client, { habitId: result.habit.id });
    },
    onError: (error) => {
      const reason = isApiError(error) ? error.details?.reason : undefined;
      toast.error(
        isApiError(error, 'UNDO_NOT_ALLOWED') && isUndoBlockReason(reason)
          ? `${UNDO_BLOCK_REASON_TEXT[reason]}.`
          : apiErrorMessage(error),
      );
      // Whatever blocked it changed since the page loaded: show the current state.
      void client.invalidateQueries({ queryKey: queryKeys.today.all });
      void client.invalidateQueries({ queryKey: queryKeys.reviews.all });
    },
  });
}
