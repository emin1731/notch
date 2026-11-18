import type { UserDto } from '@notch/shared';
import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';

/** Logged in: `['me']` holds the user, as the login and register responses return it. */
export function startSession(client: QueryClient, user: UserDto): void {
  client.setQueryData(queryKeys.me, user);
}

/**
 * Logged out: drops every cached query, so the next user never sees this one's data, and marks
 * `['me']` as nobody. `['me']` itself is kept (not removed) so the provider's observer stays on it.
 */
export function endSession(client: QueryClient): void {
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== queryKeys.me[0] });
  client.setQueryData(queryKeys.me, null);
}
