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
  /** Under `habit(id)`, so whatever refreshes the habit refreshes its history too. */
  habitTargetHistory: (id: string) => ['habit', id, 'target-history'] as const,
  cores: {
    all: ['cores'] as const,
    list: (includeArchived: boolean) => ['cores', { includeArchived }] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    latest: ['reviews', 'latest'] as const,
    /** The paged history (an infinite query). */
    list: ['reviews', 'list'] as const,
    week: (weekStart: string) => ['reviews', weekStart] as const,
  },
  stats: {
    all: ['stats'] as const,
    overview: (range: string) => ['stats', 'overview', range] as const,
    habit: (id: string, range: string) => ['stats', 'habit', id, range] as const,
  },
};

const invalidateAll = (client: QueryClient, keys: (QueryKey | undefined)[]) =>
  Promise.all(
    keys
      .filter((key) => key !== undefined)
      .map((queryKey) => client.invalidateQueries({ queryKey })),
  ).then(() => undefined);

/**
 * What each mutation makes stale (the invalidation map in plan 7.2). Stats name habits and cores and
 * count their targets, so every structure change refreshes them too.
 */
export const invalidate = {
  /**
   * Every cached day, not just the one logged: streaks and the week's hits run across days, so
   * backfilling yesterday changes today's streak. Reviews too: logging at a new target ends its
   * Undo.
   */
  logWrite: (client: QueryClient, { habitId }: { date: string; habitId: string }) =>
    invalidateAll(client, [
      queryKeys.today.all,
      queryKeys.habit(habitId),
      queryKeys.stats.all,
      queryKeys.reviews.all,
    ]),
  /** Reviews too: an edit to the habit ends its level change's Undo. */
  habitChange: (client: QueryClient, { habitId }: { habitId?: string } = {}) =>
    invalidateAll(client, [
      queryKeys.habits.all,
      queryKeys.today.all,
      queryKeys.cores.all,
      queryKeys.stats.all,
      queryKeys.reviews.all,
      habitId ? queryKeys.habit(habitId) : undefined,
    ]),
  /** Today and the stats list habits in their order, as the lists do. */
  habitOrder: (client: QueryClient) =>
    invalidateAll(client, [queryKeys.habits.all, queryKeys.today.all, queryKeys.stats.all]),
  coreChange: (client: QueryClient) =>
    invalidateAll(client, [queryKeys.cores.all, queryKeys.today.all, queryKeys.stats.all]),
  /** Archiving or unarchiving a core: it cascades to its habits. */
  coreArchive: (client: QueryClient) =>
    invalidateAll(client, [
      queryKeys.cores.all,
      queryKeys.habits.all,
      queryKeys.today.all,
      queryKeys.stats.all,
    ]),
  undo: (client: QueryClient, { habitId }: { habitId: string }) =>
    invalidateAll(client, [
      queryKeys.today.all,
      queryKeys.reviews.all,
      queryKeys.habits.all,
      queryKeys.habit(habitId),
      queryKeys.stats.all,
    ]),
};
