import { Navigate, Outlet } from 'react-router';
import { useAuth } from './auth-context';

/** The app proper: someone who hasn't finished onboarding starts there (plan 7.1). */
export function RequireOnboarded() {
  const { user } = useAuth();
  if (user && user.onboardedAt === null) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}

/** Onboarding happens once: after that, `/onboarding` is just Today. */
export function RequireNotOnboarded() {
  const { user } = useAuth();
  if (user && user.onboardedAt !== null) {
    return <Navigate to="/today" replace />;
  }
  return <Outlet />;
}
