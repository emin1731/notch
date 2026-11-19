import type { TodayResponse } from '@notch/shared';
import { describe, expect, it } from 'vitest';
import { todayHabit } from '@/test/today-api';
import {
  applyOverrides,
  backfillNote,
  clampDate,
  mergeWriteResult,
  overrideKey,
  progressMessage,
} from './today-model';

const date = '2026-11-19';
const water = todayHabit({ name: 'Water', type: 'COUNT', target: 8, unit: 'glasses' });
const run = todayHabit({
  name: 'Run',
  type: 'DURATION',
  target: 1800,
  // Logged when the target was 20 min: progress is against that.
  log: { value: 600, targetSnapshot: 1200 },
  progress: 0.5,
});
const gym = todayHabit({
  name: 'Gym',
  scheduleType: 'TIMES_PER_WEEK',
  week: { hits: 1, quota: 3 },
});
const day: TodayResponse = {
  date,
  dayProgress: 0.25,
  pendingReview: null,
  welcomeBack: false,
  groups: [{ timeOfDay: 'ANYTIME', habits: [water, run] }],
  weeklyQuota: [gym],
};

describe('applyOverrides', () => {
  it('returns the same day without overrides for it', () => {
    expect(applyOverrides(day, {})).toBe(day);
    expect(applyOverrides(day, { [overrideKey('2026-11-18', water.id)]: 4 })).toBe(day);
  });

  it('recomputes progress, the day’s average and the week’s hits', () => {
    const view = applyOverrides(day, {
      [overrideKey(date, water.id)]: 6,
      [overrideKey(date, run.id)]: 1200,
      [overrideKey(date, gym.id)]: 1,
    });
    const [shownWater, shownRun] = view.groups[0]!.habits;
    expect(shownWater).toMatchObject({ log: { value: 6, targetSnapshot: 8 }, progress: 0.75 });
    // Against the 20-minute snapshot, not today's 30 minutes.
    expect(shownRun).toMatchObject({ log: { value: 1200, targetSnapshot: 1200 }, progress: 1 });
    expect(view.dayProgress).toBe(0.875);
    expect(view.weeklyQuota[0]!.week).toEqual({ hits: 2, quota: 3 });
  });

  it('treats 0 as no log', () => {
    const view = applyOverrides(day, { [overrideKey(date, run.id)]: 0 });
    expect(view.groups[0]!.habits[1]).toMatchObject({ log: null, progress: 0 });
  });
});

describe('mergeWriteResult', () => {
  it('takes the server’s log, progress and streak', () => {
    const merged = mergeWriteResult(day, water.id, {
      log: { date, value: 8, targetSnapshot: 8 },
      habitProgress: 1,
      currentStreak: 4,
      longestStreak: 9,
    });
    expect(merged.groups[0]!.habits[0]).toMatchObject({
      log: { value: 8 },
      progress: 1,
      currentStreak: 4,
    });
    expect(merged.dayProgress).toBe(0.75);
  });
});

describe('progressMessage', () => {
  it.each([
    [null, null],
    [0, 'Fresh day. Start with the easiest one.'],
    [0.3, "Momentum's started. Keep it going."],
    [0.5, 'More than halfway. Finish strong.'],
    [1, "Everything done. That's how it's built."],
  ])('%s → %s', (progress, message) => {
    expect(progressMessage(progress)).toBe(message);
  });
});

describe('dates', () => {
  it('keeps a date only inside the 6-day window', () => {
    expect(clampDate(null, date)).toBeNull();
    expect(clampDate('2026-11-13', date)).toBe('2026-11-13');
    expect(clampDate('2026-11-12', date)).toBeNull();
    expect(clampDate('2026-11-20', date)).toBeNull();
    expect(clampDate('yesterday', date)).toBeNull();
  });

  it('mentions the review only for a day in an earlier week', () => {
    expect(backfillNote(date, date)).toBeNull();
    // 2026-11-19 is a Thursday; the 17th is the same week, the 15th (Sunday) the week before.
    expect(backfillNote('2026-11-17', date)).toBe('Logging for Tuesday.');
    expect(backfillNote('2026-11-15', date)).toBe(
      "Logging for Sunday. Last week's review won't change.",
    );
  });
});
