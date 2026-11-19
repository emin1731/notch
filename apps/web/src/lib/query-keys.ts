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
  cores: {
    all: ['cores'] as const,
    list: (includeArchived: boolean) => ['cores', { includeArchived }] as const,
  },
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
  /**
   * Every cached day, not just the one logged: streaks and the week's hits run across days, so
   * backfilling yesterday changes today's streak.
   */
  logWrite: (client: QueryClient, { habitId }: { date: string; habitId: string }) =>
    invalidateAll(client, [queryKeys.today.all, queryKeys.habit(habitId), queryKeys.stats.all]),
  habitChange: (client: QueryClient, { habitId, goalId }: { habitId?: string; goalId?: string }) =>
    invalidateAll(client, [
      queryKeys.habits.all,
      queryKeys.today.all,
      queryKeys.cores.all,
      habitId ? queryKeys.habit(habitId) : undefined,
      goalId ? queryKeys.goal(goalId) : undefined,
    ]),
  milestoneToggle: (client: QueryClient, { goalId }: { goalId: string }) =>
    invalidateAll(client, [
      queryKeys.goal(goalId),
      queryKeys.goals.all,
      queryKeys.cores.all,
      queryKeys.stats.all,
    ]),
  goalChange: (client: QueryClient, { goalId }: { goalId?: string } = {}) =>
    invalidateAll(client, [
      queryKeys.goals.all,
      queryKeys.cores.all,
      goalId ? queryKeys.goal(goalId) : undefined,
    ]),
  coreChange: (client: QueryClient) =>
    invalidateAll(client, [queryKeys.cores.all, queryKeys.today.all]),
  /** Archiving or unarchiving a core: it cascades to its goals and habits. */
  coreArchive: (client: QueryClient) =>
    invalidateAll(client, [
      queryKeys.cores.all,
      queryKeys.goals.all,
      queryKeys.habits.all,
      queryKeys.today.all,
    ]),
  undo: (client: QueryClient, { habitId }: { habitId: string }) =>
    invalidateAll(client, [queryKeys.today.all, queryKeys.reviews.all, queryKeys.habit(habitId)]),
};
