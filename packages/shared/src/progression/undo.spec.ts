import { describe, expect, it } from 'vitest';
import { startOfDayIn } from '../dates/today.js';
import { hasLaterChange, undoBlockReason } from './undo.js';

const deadline = new Date('2026-11-23T00:00:00Z');
const levelUp = { kind: 'LEVEL_UP' as const, toValue: 22, undoneAt: null, undoDeadline: deadline };
const ok = {
  now: new Date('2026-11-17T12:00:00Z'),
  hasLogSinceEffective: false,
  editedSince: false,
  currentValue: 22,
};

describe('undoBlockReason', () => {
  it('allows an automatic change before the deadline with nothing logged', () => {
    expect(undoBlockReason(levelUp, ok)).toBeNull();
    expect(undoBlockReason({ ...levelUp, kind: 'DELOAD' }, ok)).toBeNull();
    expect(undoBlockReason(levelUp, { ...ok, now: new Date(deadline.getTime() - 1) })).toBeNull();
  });

  it.each([
    ['NOT_AUTOMATIC', { ...levelUp, kind: 'MANUAL' as const, undoDeadline: null }, ok],
    ['ALREADY_UNDONE', { ...levelUp, undoneAt: new Date() }, ok],
    ['EXPIRED', levelUp, { ...ok, now: deadline }],
    ['ALREADY_LOGGED', levelUp, { ...ok, hasLogSinceEffective: true }],
    ['CHANGED_SINCE', levelUp, { ...ok, currentValue: 25 }],
    ['CHANGED_SINCE', levelUp, { ...ok, editedSince: true }],
  ])('%s', (reason, change, context) => {
    expect(undoBlockReason(change, context)).toBe(reason);
  });
});

describe('hasLaterChange', () => {
  const at = (iso: string) => new Date(iso);
  const change = {
    id: 'a',
    field: 'TARGET_VALUE' as const,
    createdAt: at('2026-11-16T00:00:00Z'),
    undoneAt: null,
  };

  it('counts later changes of the same field that were not undone', () => {
    const later = { ...change, id: 'b', createdAt: at('2026-11-17T00:00:00Z') };
    expect(hasLaterChange(change, [change, later])).toBe(true);
    expect(hasLaterChange(change, [change, { ...later, field: 'DAYS_OF_WEEK' }])).toBe(false);
    expect(
      hasLaterChange(change, [change, { ...later, undoneAt: at('2026-11-18T00:00:00Z') }]),
    ).toBe(false);
    expect(hasLaterChange(later, [change, later])).toBe(false);
  });
});

describe('startOfDayIn', () => {
  it('is local midnight as an instant, across DST', () => {
    expect(startOfDayIn('Europe/Berlin', '2026-10-25').toISOString()).toBe(
      '2026-10-24T22:00:00.000Z',
    );
    expect(startOfDayIn('Europe/Berlin', '2026-10-26').toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
    expect(startOfDayIn('Asia/Baku', '2026-11-23').toISOString()).toBe('2026-11-22T20:00:00.000Z');
    expect(startOfDayIn('UTC', '2026-11-23').toISOString()).toBe('2026-11-23T00:00:00.000Z');
  });
});
