import { addDays, todayIn } from '@notch/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, signedIn, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { mockTodayApi, todayHabit } from '@/test/today-api';
import { useTimer } from './timer';
import { weekdayName } from './today-model';

const today = todayIn(testUser.timezone, new Date());
const yesterday = addDays(today, -1);
const minute = 60_000;

function setup() {
  const vitamins = todayHabit({ name: 'Vitamins', timeOfDay: 'MORNING', currentStreak: 2 });
  const water = todayHabit({ name: 'Water', type: 'COUNT', target: 8, unit: 'glasses' });
  const meditate = todayHabit({
    name: 'Meditate',
    type: 'DURATION',
    target: 600,
    timeOfDay: 'EVENING',
  });
  const gym = todayHabit({
    name: 'Gym',
    scheduleType: 'TIMES_PER_WEEK',
    week: { hits: 1, quota: 3 },
  });
  const journal = todayHabit({
    name: 'Journal',
    scheduleType: 'TIMES_PER_WEEK',
    week: { hits: 1, quota: 1 },
  });
  const api = mockTodayApi([vitamins, water, meditate, gym, journal], { date: today });
  return { api, vitamins, water, meditate, gym, journal };
}

const card = (name: string) => screen.findByRole('article', { name });
const ring = () => screen.getByRole('progressbar', { name: 'Day progress' });

describe('Today', () => {
  beforeEach(() => signedIn());

  it('shows the day by time of day, with progress, streaks and this week', async () => {
    setup();
    renderApp('/today');

    await card('Vitamins');
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Morning',
      'Evening',
      'Anytime',
      'This week',
    ]);
    expect(ring()).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('Fresh day. Start with the easiest one.')).toBeInTheDocument();
    expect(within(await card('Vitamins')).getByLabelText('2-day streak')).toBeInTheDocument();
    const thisWeek = screen.getByRole('region', { name: 'This week' });
    expect(within(thisWeek).getByLabelText('1 of 3 this week')).toBeInTheDocument();
    // A met quota folds away but stays there.
    expect(within(thisWeek).getByText('Done for the week (1)')).toBeInTheDocument();
  });

  it('ticks a toggle at once and saves it', async () => {
    const { api, vitamins } = setup();
    const user = userEvent.setup();
    renderApp('/today');

    const done = within(await card('Vitamins')).getByRole('button', { name: 'Vitamins done' });
    await user.click(done);

    expect(done).toHaveAttribute('aria-pressed', 'true');
    expect(ring()).toHaveAttribute('aria-valuenow', '33');
    await waitFor(() => expect(api.valueOf(vitamins.id, today)).toBe(1));
    expect(api.writes()[0]).toMatchObject({ method: 'PUT', body: { value: 1 } });
    expect(
      await within(await card('Vitamins')).findByLabelText('3-day streak'),
    ).toBeInTheDocument();
  });

  it('sends quick taps as one increment', async () => {
    const { api, water } = setup();
    const user = userEvent.setup();
    renderApp('/today');

    const plus = within(await card('Water')).getByRole('button', { name: 'One more Water' });
    await user.click(plus);
    await user.click(plus);
    await user.click(plus);

    expect(within(await card('Water')).getByText('3')).toBeInTheDocument();
    await waitFor(() => expect(api.valueOf(water.id, today)).toBe(3));
    expect(api.writes()).toEqual([
      expect.objectContaining({ method: 'INCREMENT', body: { delta: 3 } }),
    ]);
  });

  it('sets an exact count by tapping the value', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(within(await card('Water')).getByRole('button', { name: /edit Water count/ }));
    const input = screen.getByRole('spinbutton', { name: 'Water count' });
    await user.clear(input);
    await user.type(input, '12{Enter}');

    await waitFor(() =>
      expect(api.writes()[0]).toMatchObject({ method: 'PUT', body: { value: 12 } }),
    );
    expect(within(await card('Water')).getByText('12')).toBeInTheDocument();
  });

  it('adds minutes to a duration', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(within(await card('Meditate')).getByRole('button', { name: 'Add time' }));
    await user.type(screen.getByLabelText('Minutes to add to Meditate'), '20{Enter}');

    await waitFor(() =>
      expect(api.writes()[0]).toMatchObject({ method: 'INCREMENT', body: { delta: 1200 } }),
    );
    expect(within(await card('Meditate')).getByText('20')).toBeInTheDocument();
  });

  it('puts a value back, with a toast, when it cannot be saved', async () => {
    const { api } = setup();
    api.failNext('PUT', () => apiError(500, 'INTERNAL'));
    const user = userEvent.setup();
    renderApp('/today');

    const done = within(await card('Vitamins')).getByRole('button', { name: 'Vitamins done' });
    await user.click(done);

    expect(
      await screen.findByText("Couldn't save that. Check your connection and try again."),
    ).toBeInTheDocument();
    await waitFor(() => expect(done).toHaveAttribute('aria-pressed', 'false'));
  });

  it('logs a past day: back a day, a note, and nothing beyond today', async () => {
    const { api, vitamins } = setup();
    const user = userEvent.setup();
    const { router } = renderApp('/today');

    await card('Vitamins');
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous day' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: weekdayName(yesterday) }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toBe(`?date=${yesterday}`);
    expect(screen.getByText('Backfilling')).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`^Logging for ${weekdayName(yesterday)}\\.`)),
    ).toBeInTheDocument();

    await user.click(within(await card('Vitamins')).getByRole('button', { name: 'Vitamins done' }));
    await waitFor(() => expect(api.valueOf(vitamins.id, yesterday)).toBe(1));
    expect(api.writes()[0]).toMatchObject({ date: yesterday });

    // Yesterday's log changes today's streak, so today is fetched again rather than reused.
    const todayFetches = api.fetches(today);
    await user.click(screen.getByRole('button', { name: 'Back to today' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    await waitFor(() => expect(api.fetches(today)).toBeGreaterThan(todayFetches));
  });

  it('stops at the edge of the 6-day window, and sends other dates to today', async () => {
    setup();
    renderApp(`/today?date=${addDays(today, -6)}`);
    await card('Vitamins');
    expect(screen.getByRole('button', { name: 'Previous day' })).toBeDisabled();

    const { router } = renderApp(`/today?date=${addDays(today, -7)}`);
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('says when nothing is scheduled', async () => {
    mockTodayApi([], { date: today });
    renderApp('/today');
    expect(await screen.findByText('Nothing scheduled today')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { name: 'Day progress' })).not.toBeInTheDocument();
  });

  it('archives a habit from its menu', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(within(await card('Water')).getByRole('button', { name: 'Water actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));

    expect(await screen.findByText(/Water is archived/)).toBeInTheDocument();
    expect(api.calls.some((call) => call.method === 'ARCHIVE')).toBe(true);
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Water' })).not.toBeInTheDocument(),
    );
  });
});

describe('Today: the timer', () => {
  beforeEach(() => {
    signedIn();
    // The clock stands still, so a slow run can't add seconds to what the timer logs.
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
  });

  it('runs from the card, shows in the shell, and logs the seconds when stopped', async () => {
    const { api, meditate } = setup();
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(
      within(await card('Meditate')).getByRole('button', { name: 'Start timer for Meditate' }),
    );
    expect(screen.getAllByRole('link', { name: /Timer running: Meditate/ }).length).toBeGreaterThan(
      0,
    );

    // As if it had been running for 12 minutes.
    useTimer.setState({
      running: { ...useTimer.getState().running!, startedAt: Date.now() - 12 * minute },
    });
    await user.click(
      within(await card('Meditate')).getByRole('button', { name: 'Stop timer for Meditate' }),
    );

    await waitFor(() => expect(api.valueOf(meditate.id, today)).toBe(720));
    expect(api.writes()[0]).toMatchObject({
      method: 'INCREMENT',
      date: today,
      body: { delta: 720 },
    });
    expect(useTimer.getState().running).toBeNull();
    expect(screen.queryByRole('link', { name: /Timer running/ })).not.toBeInTheDocument();
  });

  it('runs one timer at a time', async () => {
    const water = todayHabit({ name: 'Read', type: 'DURATION', target: 1200 });
    const meditate = todayHabit({ name: 'Meditate', type: 'DURATION', target: 600 });
    const api = mockTodayApi([water, meditate], { date: today });
    useTimer.getState().start({
      habitId: meditate.id,
      habitName: 'Meditate',
      date: today,
      startedAt: Date.now() - 5 * minute,
    });
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(
      within(await card('Read')).getByRole('button', { name: 'Start timer for Read' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'One timer at a time' });
    await user.click(within(dialog).getByRole('button', { name: 'Switch' }));

    await waitFor(() => expect(api.valueOf(meditate.id, today)).toBe(300));
    expect(useTimer.getState().running).toMatchObject({ habitId: water.id, habitName: 'Read' });
  });

  it('credits the day it started when it ran past midnight', async () => {
    const { api, meditate } = setup();
    useTimer.getState().start({
      habitId: meditate.id,
      habitName: 'Meditate',
      date: yesterday,
      startedAt: Date.now() - 30 * minute,
    });
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(
      within(await card('Meditate')).getByRole('button', { name: 'Stop timer for Meditate' }),
    );

    await waitFor(() => expect(api.valueOf(meditate.id, yesterday)).toBe(1800));
    expect(
      await screen.findByText(
        `Logged 30 min to ${weekdayName(yesterday)}, when the timer started.`,
      ),
    ).toBeInTheDocument();
  });

  it('asks before logging more than 6 hours, with the minutes editable', async () => {
    const { api, meditate } = setup();
    useTimer.getState().start({
      habitId: meditate.id,
      habitName: 'Meditate',
      date: today,
      startedAt: Date.now() - 7 * 60 * minute,
    });
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(
      within(await card('Meditate')).getByRole('button', { name: 'Stop timer for Meditate' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Still going?' });
    expect(dialog).toHaveTextContent('Meditate has been running for 7 h.');
    const minutes = within(dialog).getByLabelText('Minutes to log');
    expect(minutes).toHaveValue(420);
    await user.clear(minutes);
    await user.type(minutes, '45');
    await user.click(within(dialog).getByRole('button', { name: 'Log it' }));

    await waitFor(() => expect(api.valueOf(meditate.id, today)).toBe(2700));
    expect(useTimer.getState().running).toBeNull();
  });

  it('offers today or discarding for a start day outside the window', async () => {
    const { api, meditate } = setup();
    const started = addDays(today, -8);
    useTimer.getState().start({
      habitId: meditate.id,
      habitName: 'Meditate',
      date: started,
      startedAt: Date.now() - 20 * minute,
    });
    const user = userEvent.setup();
    renderApp('/today');

    await user.click(
      within(await card('Meditate')).getByRole('button', { name: 'Stop timer for Meditate' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'That day has passed' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));

    expect(useTimer.getState().running).toBeNull();
    expect(api.writes()).toHaveLength(0);
  });
});
