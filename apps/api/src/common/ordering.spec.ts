import { describe, expect, it } from 'vitest';
import { applyOrder } from './ordering.js';

describe('applyOrder', () => {
  const current = ['a', 'b', 'c', 'd'];

  it('puts the requested ids first and keeps the rest in their order', () => {
    expect(applyOrder(current, ['c', 'a'], { exact: false })).toEqual({
      ok: true,
      ids: ['c', 'a', 'b', 'd'],
    });
  });

  it('accepts a full reorder', () => {
    expect(applyOrder(current, ['d', 'c', 'b', 'a'], { exact: true })).toEqual({
      ok: true,
      ids: ['d', 'c', 'b', 'a'],
    });
  });

  it('rejects unknown ids', () => {
    expect(applyOrder(current, ['a', 'x'], { exact: false })).toEqual({
      ok: false,
      reason: 'unknown-id',
    });
  });

  it('requires every id when exact', () => {
    expect(applyOrder(current, ['a', 'b'], { exact: true })).toEqual({
      ok: false,
      reason: 'incomplete',
    });
  });
});
