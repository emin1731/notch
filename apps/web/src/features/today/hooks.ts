import type { LocalDate } from '@notch/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { todayApi } from './api';
import { useOverrides } from './log-sync';
import { applyOverrides } from './today-model';

/** The day from the server, with every unsaved log value applied on top. */
export function useTodayView(date: LocalDate) {
  const query = useQuery({
    queryKey: queryKeys.today.date(date),
    queryFn: () => todayApi.get(date),
  });
  const overrides = useOverrides((state) => state.values);
  const view = useMemo(
    () => (query.data ? applyOverrides(query.data, overrides) : undefined),
    [query.data, overrides],
  );
  return { ...query, view };
}
