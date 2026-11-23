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
  // Stats name habits and cores and count their targets: any change to them shows there.
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
    ['coreChange', (client: QueryClient) => invalidate.coreChange(client)],
    ['coreArchive', (client: QueryClient) => invalidate.coreArchive(client)],
    ['undo', (client: QueryClient) => invalidate.undo(client, { habitId: 'habit-1' })],
    ['habitOrder', (client: QueryClient) => invalidate.habitOrder(client)],
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

  it('refreshes Today with a new habit order, as the lists', async () => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.today.date('2026-11-19'), {});
    await invalidate.habitOrder(client);
    expect(client.getQueryState(queryKeys.today.date('2026-11-19'))?.isInvalidated).toBe(true);
  });

  // A review offers Undo only until the habit is logged at the new level or edited.
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
  ])('%s refreshes the reviews', async (_name, run) => {
    const client = new QueryClient();
    client.setQueryData(queryKeys.reviews.latest, {});
    client.setQueryData(queryKeys.reviews.week('2026-11-09'), {});
    await run(client);
    expect(client.getQueryState(queryKeys.reviews.latest)?.isInvalidated).toBe(true);
    expect(client.getQueryState(queryKeys.reviews.week('2026-11-09'))?.isInvalidated).toBe(true);
  });
});
