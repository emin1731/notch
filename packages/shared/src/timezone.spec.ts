import { describe, expect, it } from 'vitest';
import { isValidTimeZone, timezoneSchema } from './timezone.js';

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Asia/Baku', 'Europe/Berlin', 'America/Argentina/Buenos_Aires'])(
    'accepts %s',
    (tz) => {
      expect(isValidTimeZone(tz)).toBe(true);
    },
  );

  it.each(['', 'Mars/Olympus', 'Europe/Nowhere', 'GMT+25'])('rejects %j', (tz) => {
    expect(isValidTimeZone(tz)).toBe(false);
  });

  it('timezoneSchema trims and rejects unknown zones', () => {
    expect(timezoneSchema.parse(' Asia/Baku ')).toBe('Asia/Baku');
    expect(timezoneSchema.safeParse('Asia/Nowhere').success).toBe(false);
  });
});
