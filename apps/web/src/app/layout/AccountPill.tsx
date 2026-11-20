import { Settings } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { UserMenu } from './UserMenu';

/** Settings and the account, side by side in one white pill (top right). */
export function AccountPill() {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-full bg-card p-1">
      <NavLink
        to="/settings"
        aria-label="Settings"
        className={({ isActive }) =>
          cn(
            'flex size-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted',
            'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            isActive && 'bg-muted ring-1 ring-foreground/15',
          )
        }
      >
        <Settings className="size-5" aria-hidden="true" />
      </NavLink>
      <UserMenu />
    </div>
  );
}
