import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderApp } from '@/test/render';
import { mockReviewsApi, review, reviewChange } from '@/test/review-api';
import { fakeCore, fakeHabit, mockStructureApi } from '@/test/structure-api';

function setup() {
  const core = fakeCore({ name: 'Career' });
  const deepWork = fakeHabit({
    coreId: core.id,
    name: 'Deep work',
    type: 'DURATION',
    targetValue: 3300,
  });
  const read = fakeHabit({
    coreId: core.id,
    name: 'Read',
    type: 'COUNT',
    unit: 'pages',
    targetValue: 22,
  });
  const gym = fakeHabit({
    coreId: core.id,
    name: 'Gym',
    scheduleType: 'TIMES_PER_WEEK',
    timesPerWeek: 4,
  });
  mockStructureApi({ cores: [core], habits: [deepWork, read, gym] });
  const deload = reviewChange({ habitId: deepWork.id, habitName: 'Deep work' });
  const levelUp = reviewChange({
    habitId: read.id,
    habitName: 'Read',
    kind: 'LEVEL_UP',
    fromValue: 20,
    toValue: 22,
    canUndo: false,
    undoBlockedReason: 'ALREADY_LOGGED',
  });
  const latest = review({
    weekStart: '2026-11-09',
    changes: [levelUp, deload],
    habits: [
      {
        habitId: deepWork.id,
        name: 'Deep work',
        coreId: core.id,
        rate: 0.25,
        previousRate: 1,
        decision: 'DELOAD',
        reason: 'STRUGGLING',
      },
      {
        habitId: read.id,
        name: 'Read',
        coreId: core.id,
        rate: 1,
        previousRate: 1,
        decision: 'LEVEL_UP',
        reason: 'CONSISTENT',
      },
      {
        habitId: gym.id,
        name: 'Gym',
        coreId: core.id,
        rate: 0.75,
        previousRate: 1,
        decision: 'HOLD',
        reason: 'STEADY',
      },
    ],
  });
  const older = [
    review({ weekStart: '2026-11-02', seenAt: '2026-11-03T08:00:00Z' }),
    review({ weekStart: '2026-10-26', seenAt: '2026-10-27T08:00:00Z', inactive: true }),
    review({ weekStart: '2026-10-19', seenAt: '2026-10-20T08:00:00Z' }),
  ];
  const api = mockReviewsApi([latest, ...older]);
  return { api, latest, deload, levelUp };
}

const title = () => screen.findByRole('heading', { level: 1, name: /Week of/ });

describe('review page', () => {
  beforeEach(() => signedIn());

  it('shows what changed and why, with what held steady folded away', async () => {
    setup();
    renderApp('/review');

    expect(await title()).toHaveTextContent(/Nov 9 – 15|9\s*–\s*15 Nov/);
    expect(screen.getByText('Overall 80% of what you planned.')).toBeInTheDocument();
    const up = screen.getByRole('region', { name: 'Levelled up' });
    expect(within(up).getByRole('article', { name: 'Read' })).toHaveTextContent('20 → 22 pages');
    const down = within(screen.getByRole('region', { name: 'Eased off' })).getByRole('article', {
      name: 'Deep work',
    });
    expect(down).toHaveTextContent('55 min');
    expect(down).toHaveTextContent(
      "A tough week, so this got a little easier. 25% last week · 100% the week before. This isn't a step back.",
    );
    expect(await within(down).findByText('60 → 55 min')).toBeInTheDocument();
    expect(screen.getByText('Holding steady (1)')).toBeInTheDocument();
    expect(screen.getByText('Keeping the same level')).toBeInTheDocument();
  });

  it('marks the review seen once, on opening it', async () => {
    const { api, latest } = setup();
    renderApp('/review');

    await title();
    await waitFor(() => expect(api.count(`/reviews/${latest.id}/seen`)).toBe(1));
    // The refresh after marking it seen doesn't mark it again.
    await waitFor(() => expect(api.count('/reviews/latest')).toBeGreaterThan(1));
    expect(api.count(`/reviews/${latest.id}/seen`)).toBe(1);
  });

  it('undoes a change, and says why another one can’t be', async () => {
    const { api, deload } = setup();
    const user = userEvent.setup();
    renderApp('/review');

    const card = await within(await screen.findByRole('region', { name: 'Eased off' })).findByRole(
      'article',
      { name: 'Deep work' },
    );
    expect(
      within(screen.getByRole('article', { name: 'Read' })).getByText(
        "You've already logged at the new level.",
      ),
    ).toBeInTheDocument();
    await user.click(within(card).getByRole('button', { name: 'Undo' }));

    expect(
      await screen.findByText("Back to 60 min. We'll check again next week."),
    ).toBeInTheDocument();
    expect(await within(card).findByText('Undone')).toBeInTheDocument();
    expect(api.count(`/target-changes/${deload.id}/undo`)).toBe(1);
  });

  it('explains a refused undo', async () => {
    const { api, deload } = setup();
    api.refuse(deload.id, 'EXPIRED');
    const user = userEvent.setup();
    renderApp('/review');

    const card = await within(await screen.findByRole('region', { name: 'Eased off' })).findByRole(
      'article',
      { name: 'Deep work' },
    );
    await user.click(within(card).getByRole('button', { name: 'Undo' }));

    expect(
      await screen.findByText('Undo was available until the end of that week.'),
    ).toBeInTheDocument();
  });

  it('lists past reviews, page by page', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/review');

    const past = await screen.findByRole('region', { name: 'Past reviews' });
    await waitFor(() => expect(within(past).getAllByRole('link')).toHaveLength(1));
    await user.click(within(past).getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(within(past).getAllByRole('link')).toHaveLength(3));
    expect(within(past).getByText('A quiet week')).toBeInTheDocument();
    expect(within(past).queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('shows a past week, including the quiet-week message', async () => {
    setup();
    renderApp('/review/2026-10-26');

    await title();
    expect(
      screen.getByText('You were away last week. Nothing changed. Pick up where you left off.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/of what you planned/)).not.toBeInTheDocument();
  });

  it('says so for a week without a review', async () => {
    setup();
    renderApp('/review/2025-01-06');
    expect(
      await screen.findByText('No review for that week', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
  });

  it('explains when there is no review yet', async () => {
    mockStructureApi();
    mockReviewsApi([]);
    renderApp('/review');
    expect(
      await screen.findByText('Your first review arrives after your first full week.'),
    ).toBeInTheDocument();
  });
});
