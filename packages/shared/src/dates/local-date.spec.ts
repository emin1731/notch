import { describe, expect, it } from 'vitest';
import { fromDateString, isLocalDate, localDateSchema, toDateString } from './local-date.js';

describe('local dates', () => {
  it.each(['2026-11-16', '2028-02-29', '1999-12-31'])('accepts %s', (value) => {
    expect(isLocalDate(value)).toBe(true);
    expect(toDateString(fromDateString(value))).toBe(value);
  });

  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-1-1', '16/11/2026', '2026-11-16T00:00'])(
    'rejects %s',
    (value) => {
      expect(isLocalDate(value)).toBe(false);
      expect(localDateSchema.safeParse(value).success).toBe(false);
      expect(() => fromDateString(value)).toThrow(RangeError);
    },
  );

  it('maps to UTC midnight, the way Prisma returns @db.Date', () => {
    expect(fromDateString('2026-11-16').toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });
});
