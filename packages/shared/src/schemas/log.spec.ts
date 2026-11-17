import { describe, expect, it } from 'vitest';
import { incrementLogSchema, logRangeQuerySchema, setLogSchema } from './log.js';

describe('log schemas', () => {
  it('values are non-negative integers', () => {
    expect(setLogSchema.safeParse({ value: 0 }).success).toBe(true);
    expect(setLogSchema.safeParse({ value: -1 }).success).toBe(false);
    expect(setLogSchema.safeParse({ value: 1.5 }).success).toBe(false);
  });

  it('a delta must not be 0', () => {
    expect(incrementLogSchema.safeParse({ delta: -3 }).success).toBe(true);
    expect(incrementLogSchema.safeParse({ delta: 0 }).success).toBe(false);
  });

  it('a range is ordered and at most 366 days', () => {
    expect(logRangeQuerySchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(
      true,
    );
    expect(logRangeQuerySchema.safeParse({ from: '2026-02-01', to: '2026-01-01' }).success).toBe(
      false,
    );
    expect(logRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2026-12-31' }).success).toBe(
      false,
    );
  });
});
