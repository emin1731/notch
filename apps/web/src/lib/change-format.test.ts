import { describe, expect, it } from 'vitest';
import {
  changeArrow,
  changeValues,
  movedText,
  ratesText,
  reasonForKind,
  reviewSummaryText,
  undoneMessage,
  weekRangeTitle,
} from './change-format';

const duration = { type: 'DURATION', unit: null } as const;
const pages = { type: 'COUNT', unit: 'pages' } as const;
const count = { type: 'COUNT', unit: null } as const;
const toggle = { type: 'TOGGLE', unit: null } as const;

describe('change format', () => {
  it.each([
    [{ field: 'TARGET_VALUE', fromValue: 3600, toValue: 3300 }, duration, '60 → 55 min'],
    [{ field: 'TARGET_VALUE', fromValue: 20, toValue: 22 }, pages, '20 → 22 pages'],
    [{ field: 'TARGET_VALUE', fromValue: 8, toValue: 9 }, count, '8 → 9'],
    [{ field: 'TIMES_PER_WEEK', fromValue: 3, toValue: 4 }, toggle, '3× → 4× a week'],
  ] as const)('%j in %j terms reads "%s"', (change, habit, text) => {
    expect(changeValues({ kind: 'LEVEL_UP', ...change }, habit)).toBe(text);
  });

  it('explains and undoes in the habit’s terms', () => {
    const change = {
      kind: 'DELOAD',
      field: 'TARGET_VALUE',
      fromValue: 3600,
      toValue: 3300,
    } as const;
    expect(changeArrow('DELOAD')).toBe('↓');
    expect(changeArrow('LEVEL_UP')).toBe('↑');
    expect(reasonForKind('DELOAD')).toBe('A tough week, so this got a little easier');
    expect(reasonForKind('LEVEL_UP')).toBe('Two strong weeks in a row');
    expect(movedText(change, duration)).toBe('Target moved from 60 to 55 min.');
    expect(undoneMessage(change, duration)).toBe("Back to 60 min. We'll check again next week.");
    expect(
      undoneMessage(
        { kind: 'LEVEL_UP', field: 'TIMES_PER_WEEK', fromValue: 3, toValue: 4 },
        toggle,
      ),
    ).toBe("Back to 3× a week. We'll check again next week.");
  });

  it('gives the rates it has', () => {
    expect(ratesText(0.25, 1)).toBe('25% last week · 100% the week before');
    expect(ratesText(0.5, null)).toBe('50% last week');
    expect(ratesText(null, null)).toBeNull();
  });

  it('titles a week, across a month too', () => {
    // Intl puts thin spaces around the dash.
    expect(weekRangeTitle('2026-11-09')).toMatch(/^Week of (Nov 9\s–\s15|9\s*–\s*15 Nov)$/);
    expect(weekRangeTitle('2026-10-26')).toMatch(/^Week of (Oct 26\s–\sNov 1|26 Oct\s–\s1 Nov)$/);
  });

  it('counts a review’s changes for the banner', () => {
    expect(
      reviewSummaryText([{ kind: 'LEVEL_UP' }, { kind: 'LEVEL_UP' }, { kind: 'DELOAD' }]),
    ).toBe('Your week is in. 2 targets went up, 1 eased off.');
    expect(reviewSummaryText([{ kind: 'LEVEL_UP' }])).toBe('Your week is in. 1 target went up.');
    expect(reviewSummaryText([])).toBe('Your week is in.');
  });
});
