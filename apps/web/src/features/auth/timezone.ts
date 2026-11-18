import { timezoneSchema } from '@notch/shared';

/** This device's IANA timezone, or UTC if the browser reports one the API wouldn't accept. */
export function detectTimezone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timezoneSchema.safeParse(zone).success ? zone : 'UTC';
  } catch {
    return 'UTC';
  }
}
