import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { invalidate, queryKeys } from './query-keys';

/** A client holding one cached overview and one habit's stats, both fresh. */
function withCachedStats() {
  const client = new QueryClient();
  client.setQueryData(queryKeys.stats.overview('30d'), {});
  client.setQueryData(queryKeys.stats.habit('habit-1', '90d'), {});
  client.setQueryData(queryKeys.habitTargetHistory('habit-1'), []);
  const stale = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
  return { client, stale };
}

describe('invalidation', () => {
  // Stats name habits, cores and goals and count their targets: any change to them shows there.
  it.each([
    [
      'logWrite',
      (client: QueryClient) =>
        invalidate.logWrite(client, { date: '2026-11-19', habitId: 'habit-1' }),
    ],
    [
      'habitChange',
      (client: QueryClient) => invalidate.habitChange(client, { habitId: 'habit-1' }),
    ],
    ['goalChange', (client: QueryClient) => invalidate.goalChange(client)],
    ['coreChange', (client: QueryClient) => invalidate.coreChange(client)],
    ['coreArchive', (client: QueryClient) => invalidate.coreArchive(client)],
    [
      'milestoneToggle',
      (client: QueryClient) => invalidate.milestoneToggle(client, { goalId: 'goal-1' }),
    ],
    ['undo', (client: QueryClient) => invalidate.undo(client, { habitId: 'habit-1' })],
  ])('%s makes every cached stat stale', async (_name, run) => {
    const { client, stale } = withCachedStats();
    await run(client);
    expect(stale(queryKeys.stats.overview('30d'))).toBe(true);
    expect(stale(queryKeys.stats.habit('habit-1', '90d'))).toBe(true);
  });

  it('refreshes a habit’s target history with the habit', async () => {
    const { client, stale } = withCachedStats();
    await invalidate.undo(client, { habitId: 'habit-1' });
    expect(stale(queryKeys.habitTargetHistory('habit-1'))).toBe(true);
  });
});
