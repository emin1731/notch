import { useSyncExternalStore } from 'react';

/** Below Tailwind's `sm` breakpoint: phones get drawers instead of dialogs. */
const MOBILE_QUERY = '(max-width: 639px)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Whether the screen is phone-sized, following resizes and rotations. */
export function useIsMobile(): boolean {
  return useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches);
}
