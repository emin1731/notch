import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Every query key in one place (plan 7.2). A family's `all` key is a prefix of its other keys,
 * so invalidating it covers every variant.
 */
export const queryKeys = {
  me: ['me'] as const,
  today: {
    all: ['today'] as const,
    date: (date: string) => ['today', date] as const,
  },
  habits: {
    all: ['habits'] as const,
    list: (filters: object = {}) => ['habits', filters] as const,
  },
  habit: (id: string) => ['habit', id] as const,
  goals: {
    all: ['goals'] as const,
    list: (filters: object = {}) => ['goals', filters] as const,
  },
  goal: (id: string) => ['goal', id] as const,
  cores: ['cores'] as const,
  reviews: {
    all: ['reviews'] as const,
    latest: ['reviews', 'latest'] as const,
    week: (weekStart: string) => ['reviews', weekStart] as const,
  },
  stats: {
    all: ['stats'] as const,
    overview: (range: object) => ['stats', 'overview', range] as const,
    habit: (id: string, range: object) => ['stats', 'habit', id, range] as const,
  },
};

const invalidateAll = (client: QueryClient, keys: (QueryKey | undefined)[]) =>
  Promise.all(
    keys
      .filter((key) => key !== undefined)
      .map((queryKey) => client.invalidateQueries({ queryKey })),
  ).then(() => undefined);

/** What each mutation makes stale (the invalidation map in plan 7.2). */
export const invalidate = {
  logWrite: (client: QueryClient, { date, habitId }: { date: string; habitId: string }) =>
    invalidateAll(client, [
      queryKeys.today.date(date),
      queryKeys.habit(habitId),
      queryKeys.stats.all,
    ]),
  habitChange: (client: QueryClient, { habitId, goalId }: { habitId?: string; goalId?: string }) =>
    invalidateAll(client, [
      queryKeys.habits.all,
      queryKeys.today.all,
      queryKeys.cores,
      habitId ? queryKeys.habit(habitId) : undefined,
      goalId ? queryKeys.goal(goalId) : undefined,
    ]),
  milestoneToggle: (client: QueryClient, { goalId }: { goalId: string }) =>
    invalidateAll(client, [
      queryKeys.goal(goalId),
      queryKeys.goals.all,
      queryKeys.cores,
      queryKeys.stats.all,
    ]),
  goalChange: (client: QueryClient, { goalId }: { goalId?: string } = {}) =>
    invalidateAll(client, [
      queryKeys.goals.all,
      queryKeys.cores,
      goalId ? queryKeys.goal(goalId) : undefined,
    ]),
  coreChange: (client: QueryClient) =>
    invalidateAll(client, [queryKeys.cores, queryKeys.today.all]),
  undo: (client: QueryClient, { habitId }: { habitId: string }) =>
    invalidateAll(client, [queryKeys.today.all, queryKeys.reviews.all, queryKeys.habit(habitId)]),
};
