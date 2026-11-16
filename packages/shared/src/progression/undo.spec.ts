import { describe, expect, it } from 'vitest';
import { startOfDayIn } from '../dates/today.js';
import { undoBlockReason } from './undo.js';

const deadline = new Date('2026-11-23T00:00:00Z');
const levelUp = { kind: 'LEVEL_UP' as const, toValue: 22, undoneAt: null, undoDeadline: deadline };
const ok = { now: new Date('2026-11-17T12:00:00Z'), hasLogSinceEffective: false, currentValue: 22 };

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
  ])('%s', (reason, change, context) => {
    expect(undoBlockReason(change, context)).toBe(reason);
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
