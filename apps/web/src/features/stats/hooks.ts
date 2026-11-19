import type { LocalDate, StatsRange } from '@notch/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { habitsApi } from '@/features/habits/api';
import { logsApi } from '@/features/today/api';
import { apiErrorMessage } from '@/lib/forms';
import { invalidate, queryKeys } from '@/lib/query-keys';
import { statsApi } from './api';

export function useStatsOverview(range: StatsRange) {
  return useQuery({
    queryKey: queryKeys.stats.overview(range),
    queryFn: () => statsApi.overview(range),
  });
}

export function useHabitStats(id: string, range: StatsRange) {
  return useQuery({
    queryKey: queryKeys.stats.habit(id, range),
    queryFn: () => statsApi.habit(id, range),
  });
}

export function useTargetHistory(id: string) {
  return useQuery({
    queryKey: queryKeys.habitTargetHistory(id),
    queryFn: () => habitsApi.targetHistory(id),
  });
}

/** Sets a past day's value from the habit page (0 deletes the log); the stats refresh after. */
export function useSetLog(habitId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ date, value }: { date: LocalDate; value: number }) =>
      logsApi.set(habitId, date, value),
    onSuccess: (_result, { date }) => invalidate.logWrite(client, { date, habitId }),
    onError: (error) => toast.error(apiErrorMessage(error)),
  });
}

/**
 * The range in `?range=`, so a reload or Back keeps it. Anything else reads as `fallback`;
 * choosing one replaces the history entry rather than adding one per click.
 */
export function useRangeParam<T extends StatsRange>(
  allowed: readonly T[],
  fallback: T,
): [T, (range: T) => void] {
  const [params, setParams] = useSearchParams();
  const param = params.get('range');
  const range = allowed.find((option) => option === param) ?? fallback;
  const setRange = (next: T) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set('range', next);
        return updated;
      },
      { replace: true },
    );
  return [range, setRange];
}
