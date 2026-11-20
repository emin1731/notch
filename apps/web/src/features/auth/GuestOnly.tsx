import { Navigate, Outlet, useLocation } from 'react-router';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { ServerErrorScreen } from '@/components/ServerErrorScreen';
import { useAuth } from './auth-context';
import { returnPath } from './return-to';

/**
 * Login and register. Once someone is logged in (including by submitting these forms), they go
 * back to the page they asked for.
 */
export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <FullScreenLoading />;
  }
  if (status === 'error') {
    return <ServerErrorScreen />;
  }
  if (status === 'authenticated') {
    return <Navigate to={returnPath(location.state)} replace />;
  }
  return <Outlet />;
}
