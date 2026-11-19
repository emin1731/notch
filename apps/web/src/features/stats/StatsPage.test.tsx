import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderApp } from '@/test/render';
import { mockStatsApi, statsOverview } from '@/test/stats-api';
import { fakeCore, fakeGoal, fakeHabit, mockStructureApi } from '@/test/structure-api';

const health = fakeCore({ name: 'Health', color: 'emerald' });
const mind = fakeCore({ name: 'Mind', color: 'violet', icon: 'brain' });
const journal = fakeHabit({ coreId: mind.id, name: 'Journal' });
const gym = fakeHabit({
  coreId: health.id,
  name: 'Gym',
  scheduleType: 'TIMES_PER_WEEK',
  timesPerWeek: 3,
});
const marathon = fakeGoal({
  coreId: health.id,
  title: 'Run a half marathon',
  milestones: [['5 km', true], ['10 km', true], '15 km', 'Race day'],
});

const overview = statsOverview({
  overallRate: 0.874,
  daily: [
    { date: '2026-11-17', rate: 1 },
    { date: '2026-11-18', rate: null },
    { date: '2026-11-19', rate: 0.5 },
  ],
  cores: [
    { coreId: health.id, name: 'Health', color: 'emerald', icon: 'heart-pulse', rate: 0.95 },
    { coreId: mind.id, name: 'Mind', color: 'violet', icon: 'brain', rate: null },
  ],
  topStreaks: [
    { habitId: journal.id, name: 'Journal', currentStreak: 16 },
    { habitId: gym.id, name: 'Gym', currentStreak: 8 },
  ],
  goals: {
    active: 1,
    completedInRange: 2,
    items: [
      {
        id: marathon.id,
        coreId: health.id,
        title: 'Run a half marathon',
        description: null,
        deadline: null,
        status: 'ACTIVE',
        completedAt: null,
        archivedAt: null,
        sortOrder: 0,
        progress: 0.5,
        milestoneCounts: { done: 2, total: 4 },
      },
      {
        id: 'goal-done',
        coreId: mind.id,
        title: 'Read 12 books',
        description: null,
        deadline: null,
        status: 'COMPLETED',
        completedAt: '2026-11-02T10:00:00.000Z',
        archivedAt: null,
        sortOrder: 1,
        progress: 1,
        milestoneCounts: { done: 3, total: 3 },
      },
    ],
  },
  changes: { levelUps: 3, deloads: 1 },
});

const keyNumbers = () => screen.findByLabelText('Key numbers');

describe('stats page', () => {
  beforeEach(() => {
    signedIn();
    mockStructureApi({ cores: [health, mind], goals: [marathon], habits: [journal, gym] });
  });

  it('shows the key numbers, the cores, the leaderboard and the goals', async () => {
    mockStatsApi({ overview });
    renderApp('/stats');

    const numbers = await keyNumbers();
    expect(numbers).toHaveTextContent('Completion87%of what you planned');
    expect(numbers).toHaveTextContent('Best streak16days · Journal');
    expect(numbers).toHaveTextContent('Goals completed21 active');
    expect(within(numbers).getByLabelText('3 up, 1 eased off')).toBeInTheDocument();

    const cores = screen.getByRole('region', { name: 'By core' });
    expect(
      within(cores)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Health95%', 'Mind—']);

    const leaderboard = screen.getByRole('region', { name: 'Streak leaderboard' });
    expect(within(leaderboard).getByRole('link', { name: /Journal/ })).toHaveAttribute(
      'href',
      `/habits/${journal.id}`,
    );
    // A weekly habit's streak is in weeks.
    expect(within(leaderboard).getByRole('link', { name: /Gym/ })).toHaveTextContent('8 weeks');

    const goals = screen.getByRole('region', { name: 'Goals' });
    expect(
      within(goals).getByRole('progressbar', { name: 'Run a half marathon progress' }),
    ).toHaveAttribute('aria-valuetext', '2 / 4 milestones');
    expect(within(goals).getByRole('list', { name: 'Completed goals' })).toHaveTextContent(
      'Read 12 books',
    );
  });

  it('switches the range, keeping it in the URL', async () => {
    const api = mockStatsApi({
      overview: (range) =>
        statsOverview({ range: range as '30d', overallRate: range === '90d' ? 0.6 : 0.9 }),
    });
    const user = userEvent.setup();
    const { router } = renderApp('/stats');

    expect(await keyNumbers()).toHaveTextContent('Completion90%');
    await user.click(screen.getByRole('radio', { name: '90 days' }));

    await waitFor(async () => expect(await keyNumbers()).toHaveTextContent('Completion60%'));
    expect(router.state.location.search).toBe('?range=90d');
    expect(api.ranges).toEqual(['30d', '90d']);
  });

  it('opens on the range in the URL, and ignores one it doesn’t know', async () => {
    const api = mockStatsApi({ overview });
    renderApp('/stats?range=365d');
    expect(await screen.findByRole('radio', { name: '1 year' })).toBeChecked();
    await keyNumbers();
    expect(api.ranges).toEqual(['365d']);
  });

  it('falls back to 30 days for an unknown range', async () => {
    const api = mockStatsApi({ overview });
    renderApp('/stats?range=2y');
    expect(await screen.findByRole('radio', { name: '30 days' })).toBeChecked();
    await keyNumbers();
    expect(api.ranges).toEqual(['30d']);
  });

  it('has a table with the same numbers as the completion chart', async () => {
    mockStatsApi({ overview });
    const user = userEvent.setup();
    renderApp('/stats');

    const card = await screen.findByRole('region', { name: 'Completion over time' });
    expect(card).toHaveTextContent('averaged 75%');
    await user.click(within(card).getByRole('radio', { name: 'Table' }));

    const rows = within(within(card).getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      'Thu, Nov 1950%',
      'Wed, Nov 18—',
      'Tue, Nov 17100%',
    ]);
  });

  it('starts the chart at the first day with anything due', async () => {
    mockStatsApi({
      overview: statsOverview({
        daily: [
          { date: '2026-11-16', rate: null },
          { date: '2026-11-17', rate: null },
          { date: '2026-11-18', rate: 1 },
          { date: '2026-11-19', rate: null },
        ],
      }),
    });
    const user = userEvent.setup();
    renderApp('/stats');

    const card = await screen.findByRole('region', { name: 'Completion over time' });
    await user.click(within(card).getByRole('radio', { name: 'Table' }));
    expect(
      within(card)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual(['Thu, Nov 19—', 'Wed, Nov 18100%']);
  });

  it('shows a way to retry when the stats can’t load', async () => {
    const api = mockStatsApi({ overview });
    api.failOverview(2);
    const user = userEvent.setup();
    renderApp('/stats');

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await keyNumbers()).toHaveTextContent('Completion87%');
  });
});

describe('stats page without habits', () => {
  it('points to creating one', async () => {
    signedIn();
    mockStructureApi();
    mockStatsApi();
    renderApp('/stats');

    expect(await screen.findByRole('heading', { name: 'No stats yet' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a habit' })).toHaveAttribute(
      'href',
      '/habits/new',
    );
  });
});
