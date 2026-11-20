import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/features/auth/auth-context';
import { useLogout } from '@/features/auth/hooks';
import { cn } from '@/lib/utils';
import { type Theme, useTheme } from '../theme-context';

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** The avatar: who's logged in, the theme, and "Log out". */
export function UserMenu() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const logout = useLogout();
  if (!user) {
    return null;
  }
  const displayName = user.name ?? user.username;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account: ${displayName}`}
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span aria-hidden="true">{displayName.charAt(0)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-medium text-foreground">{displayName}</span>
          <span className={cn('truncate font-normal', !user.name && 'sr-only')}>
            @{user.username}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
          {THEMES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
