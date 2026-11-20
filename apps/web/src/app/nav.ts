import { CalendarCheck, ChartColumn, ClipboardCheck, Layers, type LucideIcon } from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  /** Shorter label for the bottom tab bar. */
  short: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/today', label: 'Today', short: 'Today', icon: CalendarCheck },
  { to: '/cores', label: 'Cores & Goals', short: 'Cores', icon: Layers },
  { to: '/stats', label: 'Stats', short: 'Stats', icon: ChartColumn },
  { to: '/review', label: 'Review', short: 'Review', icon: ClipboardCheck },
];

/** A route's layout hints, read by the shell: form and detail pages use a narrower column. */
export interface RouteHandle {
  width?: 'narrow';
}
