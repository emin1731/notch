import type { HabitStatsDto, StatsOverviewDto, StatsRange } from '@notch/shared';
import { api } from '@/lib/api-client';

export const statsApi = {
  overview: (range: StatsRange) =>
    api.get<StatsOverviewDto>('/stats/overview', { query: { range } }),
  habit: (id: string, range: StatsRange) =>
    api.get<HabitStatsDto>(`/stats/habits/${id}`, { query: { range } }),
};
