import type { Location } from 'react-router';

/** Router state on the way to the login page: where to go back to afterwards. */
export interface ReturnState {
  from?: Pick<Location, 'pathname' | 'search' | 'hash'>;
}

const GUEST_PATHS = new Set(['/login', '/register']);

/** The page asked for before logging in, or Today. */
export function returnPath(state: unknown): string {
  const from = (state as ReturnState | null)?.from;
  if (!from || GUEST_PATHS.has(from.pathname)) {
    return '/today';
  }
  return `${from.pathname}${from.search}${from.hash}`;
}
