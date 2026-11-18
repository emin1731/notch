import { Navigate, Outlet, useLocation } from 'react-router';
import { ServerErrorScreen } from '@/components/ServerErrorScreen';
import { useAuth } from './auth-context';
import type { ReturnState } from './return-to';

/** Pages for logged-in users. Renders nothing while loading, so the login page never flashes. */
export function RequireAuth() {
  const { status, loggedOut } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return null;
  }
  if (status === 'error') {
    return <ServerErrorScreen />;
  }
  if (status === 'anonymous') {
    // After "Log out" there's nothing to come back to: the next login may be someone else's.
    const state: ReturnState | null = loggedOut ? null : { from: location };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}
