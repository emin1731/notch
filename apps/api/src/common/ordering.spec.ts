import { describe, expect, it } from 'vitest';
import { applyOrder } from './ordering.js';

describe('applyOrder', () => {
  const current = ['a', 'b', 'c', 'd'];

  it('puts the requested ids first and keeps the rest in their order', () => {
    expect(applyOrder(current, ['c', 'a'])).toEqual(['c', 'a', 'b', 'd']);
    expect(applyOrder(current, ['d', 'c', 'b', 'a'])).toEqual(['d', 'c', 'b', 'a']);
  });

  it('rejects unknown ids', () => {
    expect(applyOrder(current, ['a', 'x'])).toBeNull();
  });
});
