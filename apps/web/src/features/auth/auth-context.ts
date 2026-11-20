import type { UserDto } from '@notch/shared';
import { createContext, useContext } from 'react';

/** `error`: the server couldn't be reached, which is not the same as being logged out. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error';

export interface AuthState {
  status: AuthStatus;
  user: UserDto | null;
  /** Asks the server again after an `error`. */
  retry: () => void;
  /** True while that retry is in flight. */
  retrying: boolean;
  /** Ends the session, even if the request fails: this browser is logged out either way. */
  logout: () => Promise<void>;
  /**
   * The server already ended the session (logged out everywhere, account deleted): forget it
   * here too, as a deliberate logout.
   */
  signedOut: () => void;
  /** Anonymous because of `logout()` or `signedOut()`, not an expired session or a first visit. */
  loggedOut: boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return state;
}
