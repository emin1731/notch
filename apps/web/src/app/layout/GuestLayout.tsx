import { Outlet } from 'react-router';
import { Logo } from './Logo';
import { ThemeMenu } from './ThemeMenu';

/** Login and register: a centered column. */
export function GuestLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between px-4">
        <Logo />
        <ThemeMenu />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[12vh]">
        <div className="w-full max-w-sm">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
