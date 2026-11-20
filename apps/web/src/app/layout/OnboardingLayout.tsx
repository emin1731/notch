import { LogOut } from 'lucide-react';
import { Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { useLogout } from '@/features/auth/hooks';
import { Logo } from './Logo';
import { ThemeMenu } from './ThemeMenu';

/** Onboarding: one focused column, no app navigation until it's done. */
export function OnboardingLayout() {
  const logout = useLogout();
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 pt-4 sm:px-6 sm:pt-6">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeMenu />
          <Button variant="surface" disabled={logout.isPending} onClick={() => logout.mutate()}>
            <LogOut />
            Log out
          </Button>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 pt-8 pb-16 sm:px-6">
        <div className="w-full max-w-2xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
