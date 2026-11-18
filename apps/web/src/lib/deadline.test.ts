import { describe, expect, it } from 'vitest';
import { deadlineText } from './deadline';

const today = '2026-11-18';

describe('deadlineText', () => {
  it.each([
    ['2026-11-30', { text: '12 days left', overdue: false }],
    ['2026-11-19', { text: '1 day left', overdue: false }],
    ['2026-11-18', { text: 'Due today', overdue: false }],
    ['2026-11-17', { text: 'Overdue', overdue: true }],
  ])('a deadline of %s', (deadline, expected) => {
    expect(deadlineText(deadline, 'ACTIVE', today)).toEqual(expected);
  });

  it('says nothing without a deadline or for a completed goal', () => {
    expect(deadlineText(null, 'ACTIVE', today)).toBeNull();
    expect(deadlineText('2026-11-01', 'COMPLETED', today)).toBeNull();
  });

  it('counts calendar days across a DST change', () => {
    expect(deadlineText('2027-03-30', 'ACTIVE', '2027-03-20')?.text).toBe('10 days left');
  });
});
