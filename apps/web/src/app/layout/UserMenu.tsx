import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/auth-context';
import { useLogout } from '@/features/auth/hooks';
import { cn } from '@/lib/utils';

/**
 * The logged-in user and "Log out". `full` shows the name next to the avatar (sidebar); `compact`
 * is the avatar alone (phone header).
 */
export function UserMenu({ variant = 'full' }: { variant?: 'full' | 'compact' }) {
  const { user } = useAuth();
  const logout = useLogout();
  if (!user) {
    return null;
  }

  const displayName = user.name ?? user.username;
  const avatar = (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground uppercase"
    >
      {displayName.charAt(0)}
    </span>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'full' ? (
          <Button variant="ghost" className="h-10 min-w-0 flex-1 justify-start gap-2 px-2">
            {avatar}
            <span className="truncate">{displayName}</span>
          </Button>
        ) : (
          <Button variant="ghost" size="icon" aria-label={`Account: ${displayName}`}>
            {avatar}
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={variant === 'full' ? 'start' : 'end'} className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium text-foreground">{displayName}</span>
          <span className={cn('truncate font-normal', !user.name && 'sr-only')}>
            @{user.username}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
