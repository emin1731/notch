import { NavLink, Outlet, useMatches } from 'react-router';
import { TimerDialogs } from '@/features/today/TimerDialogs';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, type RouteHandle } from '../nav';
import { AccountPill } from './AccountPill';
import { Logo } from './Logo';
import { TimerIndicator } from './TimerIndicator';

/**
 * A top bar on a grey page: the logo and the sections as a pill group, then the running timer and
 * the account pill (Settings, the avatar menu). On phones the sections move to a floating pill at
 * the bottom.
 */
export function AppShell() {
  const narrow = useMatches().some(
    (match) => (match.handle as RouteHandle | undefined)?.width === 'narrow',
  );
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="flex items-center gap-5">
          <Logo />
          <MainNav />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <TimerIndicator className="max-w-52" />
          <AccountPill />
        </div>
      </header>

      <TimerDialogs />
      <main className="mx-auto w-full max-w-5xl px-4 pt-6 pb-32 sm:px-6 sm:pt-8 md:pb-16">
        <div className={cn('flex flex-col', narrow && 'max-w-2xl')}>
          <Outlet />
        </div>
      </main>

      <TabBar />
    </div>
  );
}

function MainNav() {
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-0.5 rounded-full bg-card p-1">
        {NAV_ITEMS.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors',
                  'hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  isActive && 'bg-primary text-primary-foreground hover:text-primary-foreground',
                )
              }
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Phones: the sections in a floating pill above the bottom edge. */
function TabBar() {
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 md:hidden"
    >
      <ul className="grid grid-cols-4 gap-1 rounded-full bg-card p-1.5 shadow-lg ring-1 ring-foreground/5">
        {NAV_ITEMS.map(({ to, short, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium text-muted-foreground transition-colors',
                  'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                  isActive && 'bg-primary text-primary-foreground',
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {short}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
