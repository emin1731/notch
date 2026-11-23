import {
  todayIn,
  UNDO_BLOCK_REASON_TEXT,
  UNDO_BLOCK_REASONS,
  type TodayHabit,
} from '@notch/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { signedIn, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { mockReviewsApi, review, reviewChange } from '@/test/review-api';
import { mockStructureApi } from '@/test/structure-api';
import { mockTodayApi, todayHabit } from '@/test/today-api';

const today = todayIn(testUser.timezone, new Date());

const change = (fields: Partial<NonNullable<TodayHabit['change']>> = {}): TodayHabit['change'] => ({
  id: 'change-1',
  kind: 'DELOAD',
  field: 'TARGET_VALUE',
  fromValue: 3600,
  toValue: 3300,
  canUndo: true,
  undoBlockedReason: null,
  ...fields,
});

const card = (name: string) => screen.findByRole('article', { name });

describe('target change badge', () => {
  beforeEach(() => {
    signedIn();
    mockStructureApi();
  });

  it.each([
    [{ type: 'DURATION', target: 3300 }, change(), 'Eased off: 60 → 55 min', '↓ 60 → 55 min'],
    [
      { type: 'COUNT', unit: 'pages', target: 22 },
      change({ kind: 'LEVEL_UP', fromValue: 20, toValue: 22 }),
      'Levelled up: 20 → 22 pages',
      '↑ 20 → 22 pages',
    ],
    [
      { type: 'COUNT', target: 9 },
      change({ kind: 'LEVEL_UP', fromValue: 8, toValue: 9 }),
      'Levelled up: 8 → 9',
      '↑ 8 → 9',
    ],
    [
      { type: 'TOGGLE', scheduleType: 'TIMES_PER_WEEK', week: { hits: 0, quota: 4 } },
      change({ kind: 'LEVEL_UP', field: 'TIMES_PER_WEEK', fromValue: 3, toValue: 4 }),
      'Levelled up: 3× → 4× a week',
      '↑ 3× → 4× a week',
    ],
  ] as const)('reads in the habit’s terms (%j)', async (fields, habitChange, label, text) => {
    mockTodayApi([todayHabit({ name: 'Habit', ...fields, change: habitChange })], { date: today });
    renderApp('/today');
    const badge = within(await card('Habit')).getByRole('button', { name: label });
    expect(badge).toHaveTextContent(text);
  });

  it('explains the change and undoes it', async () => {
    const habit = todayHabit({
      name: 'Deep work',
      type: 'DURATION',
      target: 3300,
      change: change(),
    });
    mockTodayApi([habit], { date: today });
    const deload = reviewChange({ id: 'change-1', habitId: habit.id, habitName: 'Deep work' });
    mockReviewsApi([review({ weekStart: '2026-11-09', changes: [deload] })], {
      onUndo: () => {
        delete habit.change;
      },
    });
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(within(await card('Deep work')).getByRole('button', { name: /Eased off/ }));
    const popover = await screen.findByRole('dialog');
    expect(popover).toHaveTextContent('A tough week, so this got a little easier');
    expect(popover).toHaveTextContent("Target moved from 60 to 55 min. This isn't a step back.");
    await user.click(within(popover).getByRole('button', { name: 'Undo' }));

    expect(
      await screen.findByText("Back to 60 min. We'll check again next week."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByRole('article', { name: 'Deep work' })).queryByRole('button', {
          name: /Eased off/,
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it.each(UNDO_BLOCK_REASONS)('says why it can’t be undone: %s', async (reason) => {
    mockTodayApi(
      [
        todayHabit({
          name: 'Deep work',
          type: 'DURATION',
          target: 3300,
          change: change({ canUndo: false, undoBlockedReason: reason }),
        }),
      ],
      { date: today },
    );
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(within(await card('Deep work')).getByRole('button', { name: /Eased off/ }));
    const popover = await screen.findByRole('dialog');
    expect(popover).toHaveTextContent(`${UNDO_BLOCK_REASON_TEXT[reason]}.`);
    expect(within(popover).queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });
});

describe('review banners on Today', () => {
  beforeEach(() => {
    signedIn();
    mockStructureApi();
  });

  it('counts the changes, and goes once the review is opened', async () => {
    const latest = review({
      weekStart: '2026-11-09',
      changes: [
        reviewChange({ habitId: 'a', habitName: 'A', kind: 'LEVEL_UP' }),
        reviewChange({ habitId: 'b', habitName: 'B', kind: 'LEVEL_UP' }),
        reviewChange({ habitId: 'c', habitName: 'C' }),
      ],
    });
    const day = mockTodayApi([todayHabit({ name: 'Vitamins' })], { date: today });
    day.meta.pendingReview = { id: latest.id, weekStart: latest.weekStart };
    mockReviewsApi([latest], {
      onSeen: () => {
        day.meta.pendingReview = null;
      },
    });
    const user = userEvent.setup();
    renderApp('/today');

    const banner = await screen.findByRole('link', { name: /See review/ });
    await waitFor(() =>
      expect(banner).toHaveTextContent('Your week is in. 2 targets went up, 1 eased off.'),
    );
    await user.click(banner);
    await screen.findByRole('heading', { level: 1, name: /Week of/ });

    await user.click(screen.getAllByRole('link', { name: 'Today' })[0]!);
    await card('Vitamins');
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /See review/ })).not.toBeInTheDocument(),
    );
  });

  it('welcomes you back after a quiet week', async () => {
    const quiet = review({ weekStart: '2026-11-09', inactive: true });
    const day = mockTodayApi([todayHabit({ name: 'Vitamins' })], { date: today });
    day.meta.pendingReview = { id: quiet.id, weekStart: quiet.weekStart };
    day.meta.welcomeBack = true;
    mockReviewsApi([quiet]);
    renderApp('/today');

    expect(await screen.findByRole('link', { name: /See review/ })).toHaveTextContent(
      'You were away last week. Nothing changed. Pick up where you left off.',
    );
  });

  it('isn’t shown on a past day', async () => {
    const latest = review({ weekStart: '2026-11-09' });
    const day = mockTodayApi([todayHabit({ name: 'Vitamins' })], { date: today });
    day.meta.pendingReview = { id: latest.id, weekStart: latest.weekStart };
    mockReviewsApi([latest]);
    const user = userEvent.setup();
    renderApp('/today');

    await screen.findByRole('link', { name: /See review/ });
    await user.click(screen.getByRole('button', { name: 'Previous day' }));
    await screen.findByText('Past day');
    expect(screen.queryByRole('link', { name: /See review/ })).not.toBeInTheDocument();
  });
});
