import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { setUnauthenticatedHandler } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { authApi } from './api';
import { AuthContext, type AuthState, type AuthStatus } from './auth-context';
import { endSession } from './session';

/** Who's logged in (plan 7.2): the `['me']` query, plus what a 401 elsewhere means. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const me = useQuery({ queryKey: queryKeys.me, queryFn: authApi.me, staleTime: Infinity });
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      // Only a session that was there can end; a logged-out 401 needs no toast.
      if (!client.getQueryData(queryKeys.me)) {
        return;
      }
      setLoggedOut(false);
      endSession(client);
      toast('Your session ended. Log in again.');
    });
    return () => setUnauthenticatedHandler(null);
  }, [client]);

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    // Set before `['me']` turns null, so RequireAuth never sees an unexplained logout.
    setLoggedOut(true);
    endSession(client);
  }, [client]);

  const signedOut = useCallback(() => {
    setLoggedOut(true);
    endSession(client);
  }, [client]);

  const { data, isError, isFetching, refetch } = me;
  const value = useMemo<AuthState>(() => {
    const status: AuthStatus =
      data !== undefined ? (data ? 'authenticated' : 'anonymous') : isError ? 'error' : 'loading';
    return {
      status,
      user: data ?? null,
      retry: () => void refetch(),
      retrying: isError && isFetching,
      logout,
      signedOut,
      loggedOut,
    };
  }, [data, isError, isFetching, refetch, logout, signedOut, loggedOut]);

  return <AuthContext value={value}>{children}</AuthContext>;
}
