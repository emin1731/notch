import { describe, expect, it } from 'vitest';
import { streakResetText } from '@/features/habits/copy';
import { dateRangeText, percent, streakText, totalText } from './stats-format';

describe('stats format', () => {
  it('rounds rates, and says "—" when there was nothing to count', () => {
    expect(percent(0.874)).toBe('87%');
    expect(percent(1)).toBe('100%');
    expect(percent(0)).toBe('0%');
    expect(percent(null)).toBe('—');
  });

  it('counts streaks in days, or weeks for weekly habits', () => {
    expect(streakText(1, 'DAILY')).toBe('1 day');
    expect(streakText(21, 'SPECIFIC_DAYS')).toBe('21 days');
    expect(streakText(1, 'TIMES_PER_WEEK')).toBe('1 week');
    expect(streakText(8, 'TIMES_PER_WEEK')).toBe('8 weeks');
  });

  it('says plan 14’s streak reset line', () => {
    expect(streakResetText({ longestStreak: 21, scheduleType: 'DAILY' })).toBe(
      'Streak reset. Your longest is still 21 days. Go beat it.',
    );
    expect(streakResetText({ longestStreak: 7, scheduleType: 'TIMES_PER_WEEK' })).toBe(
      'Streak reset. Your longest is still 7 weeks. Go beat it.',
    );
  });

  it('totals in the habit’s terms', () => {
    expect(totalText({ type: 'DURATION', unit: null }, 45_000)).toBe('12 h 30 min');
    expect(totalText({ type: 'COUNT', unit: 'pages' }, 340)).toBe('340 pages');
    expect(totalText({ type: 'COUNT', unit: null }, 12)).toBe('12');
    expect(totalText({ type: 'TOGGLE', unit: null }, 18)).toBe('18 times');
    expect(totalText({ type: 'TOGGLE', unit: null }, 1)).toBe('1 time');
  });

  it('adds the years only to a range that spans two', () => {
    expect(dateRangeText('2026-10-21', '2026-11-19')).not.toMatch(/2026/);
    expect(dateRangeText('2025-11-20', '2026-11-19')).toMatch(/2025.*2026/);
  });
});
