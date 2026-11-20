import { Outlet } from 'react-router';
import { Logo } from './Logo';
import { ThemeMenu } from './ThemeMenu';

/** Login and register: a centered column. */
export function GuestLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 pt-4 sm:px-6 sm:pt-6">
        <Logo />
        <ThemeMenu />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[10vh] pb-16">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
