import { timezoneSchema } from '@notch/shared';
import { useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';

/** This device's IANA timezone, or UTC if the browser reports one the API wouldn't accept. */
export function deviceTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezoneSchema.safeParse(zone).success ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Every timezone the browser knows, plus `current` (so the saved one is always choosable). */
export function timezoneOptions(current: string): { value: string; label: string }[] {
  const known =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...known, 'UTC', current])]
    .sort()
    .map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }));
}

/** Where the banner on Today remembers "not now", per device timezone. */
export const TIMEZONE_DISMISSED_KEY = 'notch-timezone-dismissed';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(TIMEZONE_DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * The device and the account disagree on the timezone (plan 7.5: "Your device is on Asia/Baku but
 * your account uses UTC. Update?"). `dismissed` is per device timezone: moving again asks again.
 */
export function useTimezoneMismatch() {
  const { user } = useAuth();
  const [device] = useState(deviceTimezone);
  const [dismissedFor, setDismissedFor] = useState(readDismissed);
  const account = user?.timezone ?? device;
  return {
    device,
    account,
    mismatch: account !== device,
    dismissed: dismissedFor === device,
    dismiss: () => {
      try {
        localStorage.setItem(TIMEZONE_DISMISSED_KEY, device);
      } catch {
        // Not remembered, then: it asks again next time.
      }
      setDismissedFor(device);
    },
  };
}

/** "Your device is on Asia/Baku but your account uses UTC." */
export const mismatchText = (device: string, account: string) =>
  `Your device is on ${device} but your account uses ${account}.`;
