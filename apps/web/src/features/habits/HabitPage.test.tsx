import { addDays, type HabitDto, type HeatmapDay, todayIn } from '@notch/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, signedIn, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { habitStats, heatmapDays, mockStatsApi, targetChange } from '@/test/stats-api';
import { fakeCore, fakeGoal, fakeHabit, mockStructureApi } from '@/test/structure-api';

const today = todayIn(testUser.timezone, new Date());
const daysAgo = (n: number) => addDays(today, -n);

const career = fakeCore({ name: 'Career', color: 'indigo', icon: 'briefcase' });
const book = fakeGoal({ coreId: career.id, title: 'Ship the book' });

/** A 30-day window with a known pattern: a few days 10 and 9 days ago, the rest empty. */
function days(overrides: Record<string, Partial<HeatmapDay>> = {}): HeatmapDay[] {
  return heatmapDays(today, 30, (date) => ({ target: 3300, ...overrides[date] }));
}

/**
 * The habit's stats over a mutable heatmap, and `PUT /habits/:id/logs/:date` writing into it,
 * so a saved log shows in the refetched stats.
 */
function setup(
  habit: HabitDto,
  heatmap: HeatmapDay[],
  extra: Parameters<typeof habitStats>[0] = { habitId: habit.id },
) {
  mockStructureApi({ cores: [career], goals: [book], habits: [habit] });
  const api = mockStatsApi({
    habits: {
      [habit.id]: (range) =>
        habitStats({
          ...extra,
          habitId: habit.id,
          range: range as '30d',
          heatmap: [...heatmap],
          targetSeries: extra.targetSeries ?? [
            { date: heatmap[0]!.date, target: habit.targetValue },
          ],
        }),
    },
  });
  const writes: { date: string; value: number }[] = [];
  server.use(
    http.put(`${API}/habits/:id/logs/:date`, async ({ request, params }) => {
      const { value } = (await request.json()) as { value: number };
      const date = params.date as string;
      writes.push({ date, value });
      const index = heatmap.findIndex((day) => day.date === date);
      heatmap[index] = { ...heatmap[index]!, value, hit: value >= heatmap[index]!.target };
      return HttpResponse.json({
        log: value > 0 ? { date, value, targetSnapshot: heatmap[index]!.target } : null,
        habitProgress: 0,
        currentStreak: 0,
        longestStreak: 0,
      });
    }),
  );
  return { api, writes };
}

const deepWork = fakeHabit({
  coreId: career.id,
  goalId: book.id,
  name: 'Deep work',
  type: 'DURATION',
  targetValue: 3300,
  initialTargetValue: 3000,
  longestStreak: 21,
  startDate: daysAgo(60),
});

describe('habit page', () => {
  beforeEach(() => signedIn());

  it('shows the habit, its streaks and the streak reset line', async () => {
    setup(deepWork, days());
    renderApp(`/habits/${deepWork.id}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Deep work' })).toBeInTheDocument();
    expect(await screen.findByText('Career')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Goal: Ship the book' })).toHaveAttribute(
      'href',
      `/goals/${book.id}`,
    );
    expect(screen.getByText('Target').nextSibling).toHaveTextContent('55 min');
    expect(screen.getByText('Schedule').nextSibling).toHaveTextContent('Every day');
    expect(screen.getByText('Current streak').nextSibling).toHaveTextContent('0 days');
    expect(screen.getByText('Longest streak').nextSibling).toHaveTextContent('21 days');
    expect(
      screen.getByText('Streak reset. Your longest is still 21 days. Go beat it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/habits/${deepWork.id}/edit`,
    );
  });

  it('totals the range, counting only the level-ups that stuck', async () => {
    const heatmap = days();
    setup(deepWork, heatmap, {
      habitId: deepWork.id,
      rate: 0.75,
      hits: 18,
      occurrences: 24,
      totalValue: 45_000,
    });
    server.use(
      http.get(`${API}/habits/:id/target-history`, () =>
        HttpResponse.json([
          // Before the window: not counted.
          targetChange({
            habitId: deepWork.id,
            effectiveFrom: daysAgo(45),
            fromValue: 2700,
            toValue: 3000,
          }),
          targetChange({
            habitId: deepWork.id,
            effectiveFrom: daysAgo(17),
            fromValue: 3000,
            toValue: 3300,
          }),
          targetChange({
            habitId: deepWork.id,
            effectiveFrom: daysAgo(3),
            fromValue: 3300,
            toValue: 3600,
            undoneAt: `${daysAgo(2)}T08:00:00.000Z`,
          }),
        ]),
      ),
    );
    renderApp(`/habits/${deepWork.id}`);

    const totals = await screen.findByLabelText('Totals');
    expect(totals).toHaveTextContent('Completion75%18 of 24 days');
    expect(totals).toHaveTextContent('Total logged12 h 30 min');
    expect(totals).toHaveTextContent('Level-ups1in this range');
  });

  it('labels every heatmap day, and its table says the same', async () => {
    setup(
      deepWork,
      days({
        [daysAgo(1)]: { value: 3300, hit: true },
        [daysAgo(2)]: { value: 1500 },
        [daysAgo(4)]: { scheduled: false },
        [daysAgo(5)]: { scheduled: false, value: 600 },
      }),
    );
    const user = userEvent.setup();
    renderApp(`/habits/${deepWork.id}`);

    const calendar = await screen.findByRole('region', { name: 'Calendar' });
    const label = (n: number) =>
      within(calendar).getByRole('img', { name: new RegExp(`^${dateText(daysAgo(n))}:`) });
    expect(label(0)).toHaveAccessibleName(`${dateText(today)}: not yet`);
    expect(label(1)).toHaveAccessibleName(`${dateText(daysAgo(1))}: 55 min, target hit`);
    expect(label(2)).toHaveAccessibleName(`${dateText(daysAgo(2))}: 25 min of 55 min`);
    expect(label(3)).toHaveAccessibleName(`${dateText(daysAgo(3))}: missed`);
    expect(label(4)).toHaveAccessibleName(`${dateText(daysAgo(4))}: not scheduled`);
    expect(label(5)).toHaveAccessibleName(`${dateText(daysAgo(5))}: not scheduled, bonus 10 min`);
    expect(within(calendar).getAllByRole('img')).toHaveLength(30);

    await user.click(within(calendar).getByRole('radio', { name: 'Table' }));
    const rows = within(calendar).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(30);
    expect(rows.slice(1, 6).map((row) => row.textContent)).toEqual([
      `${dateText(daysAgo(1))}55 min55 min55 min, target hit`,
      `${dateText(daysAgo(2))}25 min55 min25 min of 55 min`,
      `${dateText(daysAgo(3))}0 min55 minmissed`,
      `${dateText(daysAgo(4))}0 min—not scheduled`,
      `${dateText(daysAgo(5))}10 min—not scheduled, bonus 10 min`,
    ]);
  });

  it('charts the target, with an undone change in its table', async () => {
    const heatmap = days();
    setup(deepWork, heatmap, {
      habitId: deepWork.id,
      targetSeries: [
        { date: heatmap[0]!.date, target: 3000 },
        { date: daysAgo(17), target: 3300 },
      ],
    });
    server.use(
      http.get(`${API}/habits/:id/target-history`, () =>
        HttpResponse.json([
          targetChange({
            habitId: deepWork.id,
            effectiveFrom: daysAgo(17),
            fromValue: 3000,
            toValue: 3300,
          }),
          targetChange({
            habitId: deepWork.id,
            kind: 'DELOAD',
            effectiveFrom: daysAgo(3),
            fromValue: 3300,
            toValue: 3000,
            undoneAt: `${daysAgo(2)}T08:00:00.000Z`,
          }),
        ]),
      ),
    );
    const user = userEvent.setup();
    renderApp(`/habits/${deepWork.id}`);

    const chart = await screen.findByRole('region', { name: 'Target over time' });
    expect(chart).toHaveTextContent('From 50 min to 55 min: 1 level-ups, 0 deloads, 1 undone.');
    await user.click(within(chart).getByRole('radio', { name: 'Table' }));
    expect(
      within(chart)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.textContent),
    ).toEqual([
      `${dateText(daysAgo(3))}55 → 50 minEased off (undone)`,
      `${dateText(daysAgo(17))}50 → 55 minLevelled up`,
      `${dateText(heatmap[0]!.date)}50 minStart of the range`,
    ]);
  });

  it('says so when the target didn’t change, and has no target chart for a daily toggle', async () => {
    setup(deepWork, days());
    const { unmount } = renderApp(`/habits/${deepWork.id}`);
    expect(
      await screen.findByText("This target hasn't changed in this range: 55 min throughout."),
    ).toBeInTheDocument();
    unmount();

    const vitamins = fakeHabit({ coreId: career.id, name: 'Vitamins' });
    setup(vitamins, heatmapDays(today, 30));
    renderApp(`/habits/${vitamins.id}`);
    await screen.findByRole('region', { name: 'Calendar' });
    expect(screen.queryByRole('heading', { name: 'Target over time' })).not.toBeInTheDocument();
  });

  it('edits a recent day in minutes, and the stats refresh', async () => {
    const { api, writes } = setup(deepWork, days());
    const user = userEvent.setup();
    renderApp(`/habits/${deepWork.id}`);

    const field = await screen.findByRole('spinbutton', { name: 'Minutes: Deep work, Yesterday' });
    await user.clear(field);
    await user.type(field, '25{Enter}');

    await waitFor(() => expect(writes).toEqual([{ date: daysAgo(1), value: 1500 }]));
    const recent = screen.getByRole('region', { name: 'Last 14 days' });
    await waitFor(() => expect(within(recent).getByText('25 min of 55 min')).toBeInTheDocument());
    expect(api.ranges).toEqual(['30d', '30d']);
  });

  it('ignores a value it can’t save and puts the old one back', async () => {
    const { writes } = setup(deepWork, days({ [daysAgo(1)]: { value: 1200 } }));
    const user = userEvent.setup();
    renderApp(`/habits/${deepWork.id}`);

    const field = await screen.findByRole('spinbutton', { name: 'Minutes: Deep work, Yesterday' });
    expect(field).toHaveValue(20);
    await user.clear(field);
    await user.type(field, '2000{Enter}');
    expect(field).toHaveValue(20);
    await user.clear(field);
    await user.type(field, '20{Enter}');
    expect(writes).toEqual([]);
  });

  it('ticks a toggle and counts a count', async () => {
    const vitamins = fakeHabit({ coreId: career.id, name: 'Vitamins', startDate: daysAgo(60) });
    const { writes } = setup(vitamins, heatmapDays(today, 30));
    const user = userEvent.setup();
    const { unmount } = renderApp(`/habits/${vitamins.id}`);
    await user.click(await screen.findByRole('checkbox', { name: 'Done: Vitamins, Today' }));
    await waitFor(() => expect(writes).toEqual([{ date: today, value: 1 }]));
    unmount();

    const read = fakeHabit({
      coreId: career.id,
      name: 'Read',
      type: 'COUNT',
      unit: 'pages',
      targetValue: 25,
      startDate: daysAgo(60),
    });
    const count = setup(
      read,
      heatmapDays(today, 30, () => ({ target: 25 })),
    );
    renderApp(`/habits/${read.id}`);
    const field = await screen.findByRole('spinbutton', { name: 'Pages: Read, Yesterday' });
    await user.clear(field);
    await user.type(field, '30{Enter}');
    await waitFor(() => expect(count.writes).toEqual([{ date: daysAgo(1), value: 30 }]));
  });

  it('locks the days outside the backfill window, and every day of an archived habit', async () => {
    setup(deepWork, days());
    const { unmount } = renderApp(`/habits/${deepWork.id}`);

    const recent = await screen.findByRole('region', { name: 'Last 14 days' });
    expect(within(recent).getAllByRole('spinbutton')).toHaveLength(7);
    expect(within(recent).getAllByText('(can’t be changed)')).toHaveLength(7);
    expect(recent).toHaveTextContent(`Days before ${dateText(daysAgo(6))} can’t be changed.`);
    unmount();

    const archived = { ...deepWork, id: 'archived-habit', archivedAt: '2026-11-01T00:00:00.000Z' };
    setup(archived, days());
    renderApp(`/habits/${archived.id}`);
    const locked = await screen.findByRole('region', { name: 'Last 14 days' });
    expect(within(locked).queryAllByRole('spinbutton')).toHaveLength(0);
    expect(locked).toHaveTextContent('Archived habits can’t be logged.');
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('never offers a day before the habit started', async () => {
    const fresh = { ...deepWork, id: 'fresh-habit', startDate: daysAgo(2) };
    setup(
      fresh,
      heatmapDays(today, 3, () => ({ target: 3300 })),
    );
    renderApp(`/habits/${fresh.id}`);

    const recent = await screen.findByRole('region', { name: 'Last 14 days' });
    expect(within(recent).getAllByRole('spinbutton')).toHaveLength(3);
    expect(recent).toHaveTextContent(`Days before ${dateText(daysAgo(2))} can’t be changed.`);
  });

  it('switches the range', async () => {
    const { api } = setup(deepWork, days());
    const user = userEvent.setup();
    const { router } = renderApp(`/habits/${deepWork.id}`);

    await user.click(await screen.findByRole('radio', { name: '1 year' }));
    await waitFor(() => expect(api.ranges).toEqual(['30d', '365d']));
    expect(router.state.location.search).toBe('?range=365d');
  });

  it('says when the habit doesn’t exist', async () => {
    mockStructureApi({ cores: [career] });
    mockStatsApi();
    renderApp('/habits/00000000-0000-4000-8000-999999999999');
    expect(await screen.findByRole('heading', { name: 'Habit not found' })).toBeInTheDocument();
  });
});

function dateText(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
