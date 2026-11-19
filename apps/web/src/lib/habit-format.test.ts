import { describe, expect, it } from 'vitest';
import { formatDuration, formatMinutes, formatTarget, scheduleText } from './habit-format';

describe('habit format', () => {
  it.each([
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [120, '2 h'],
  ])('%i minutes reads "%s"', (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text);
    expect(formatDuration(minutes * 60)).toBe(text);
  });

  it('formats targets by type', () => {
    expect(formatTarget({ type: 'DURATION', targetValue: 1200, unit: null })).toBe('20 min');
    expect(formatTarget({ type: 'COUNT', targetValue: 10, unit: 'pages' })).toBe('10 pages');
    expect(formatTarget({ type: 'COUNT', targetValue: 8, unit: null })).toBe('8');
    expect(formatTarget({ type: 'TOGGLE', targetValue: 1, unit: null })).toBeNull();
  });

  it.each([
    [{ scheduleType: 'DAILY', daysOfWeek: [], timesPerWeek: null }, 'Every day'],
    [{ scheduleType: 'TIMES_PER_WEEK', daysOfWeek: [], timesPerWeek: 3 }, '3× a week'],
    [{ scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [5, 1, 3], timesPerWeek: null }, 'Mon, Wed, Fri'],
    [
      { scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [1, 2, 3, 4, 5], timesPerWeek: null },
      'Weekdays',
    ],
    [{ scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [6, 7], timesPerWeek: null }, 'Weekends'],
    [
      { scheduleType: 'SPECIFIC_DAYS', daysOfWeek: [1, 2, 3, 4, 5, 6, 7], timesPerWeek: null },
      'Every day',
    ],
  ] as const)('schedule %j reads "%s"', (habit, text) => {
    expect(scheduleText(habit)).toBe(text);
  });
});
