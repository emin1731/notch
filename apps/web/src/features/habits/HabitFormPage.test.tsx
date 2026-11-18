import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, signedIn } from '@/test/auth';
import { renderApp } from '@/test/render';
import { fakeCore, fakeGoal, fakeHabit, mockStructureApi } from '@/test/structure-api';

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const health = fakeCore({ name: 'Health' });
  const career = fakeCore({ name: 'Career', color: 'indigo', icon: 'briefcase' });
  const marathon = fakeGoal({ coreId: health.id, title: 'Run a half marathon' });
  const promotion = fakeGoal({ coreId: career.id, title: 'Get promoted' });
  const run = fakeHabit({
    coreId: health.id,
    goalId: marathon.id,
    name: 'Morning run',
    type: 'DURATION',
    targetValue: 1800,
    initialTargetValue: 1800,
    scheduleType: 'SPECIFIC_DAYS',
    daysOfWeek: [1, 3, 5],
    stepType: 'ABSOLUTE',
    stepValue: 300,
    minTarget: 900,
  });
  const api = mockStructureApi({
    cores: [health, career],
    goals: [marathon, promotion],
    habits: [run],
  });
  return { api, health, career, marathon, promotion, run };
}

/** The page title shows on the loading skeleton too: wait for the form itself. */
const heading = async (name: string) => {
  await screen.findByRole('heading', { level: 1, name });
  await screen.findByLabelText('Name');
};
const radio = (name: string) => screen.getByRole('radio', { name });
const submit = (user: User, name = 'Add habit') => user.click(screen.getByRole('button', { name }));

describe('habit form: creating', () => {
  beforeEach(() => signedIn());

  it('creates a yes/no habit every day, with the core from the link and no levels', async () => {
    const { api, career } = setup();
    const user = userEvent.setup();
    const { router } = renderApp(`/habits/new?coreId=${career.id}`);

    await heading('New habit');
    expect(screen.getByLabelText('Core')).toHaveValue(career.id);
    expect(screen.getByText(/Levels work on how often you do a yes\/no habit/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Vitamins');
    await submit(user);

    await waitFor(() => expect(router.state.location.pathname).toBe('/cores'));
    expect(api.sent('POST', '/habits')[0]?.body).toMatchObject({
      coreId: career.id,
      goalId: null,
      name: 'Vitamins',
      type: 'TOGGLE',
      targetValue: 1,
      scheduleType: 'DAILY',
      daysOfWeek: [],
      timesPerWeek: null,
      minTarget: null,
      maxTarget: null,
    });
  });

  it('creates a count habit on some days, linked to a goal, and goes to the goal', async () => {
    const { api, health, marathon } = setup();
    const user = userEvent.setup();
    const { router } = renderApp(`/habits/new?coreId=${health.id}&goalId=${marathon.id}`);

    await heading('New habit');
    expect(screen.getByLabelText('Goal (optional)')).toHaveValue(marathon.id);
    await user.type(screen.getByLabelText('Name'), 'Stretch');
    await user.click(radio('Count'));
    const target = screen.getByLabelText('Target');
    await user.clear(target);
    await user.type(target, '12');
    await user.type(screen.getByLabelText('Unit (optional)'), 'minutes');
    await user.click(radio('Some days'));
    for (const day of ['Friday', 'Monday', 'Wednesday']) {
      await user.click(screen.getByRole('button', { name: day }));
    }
    await submit(user);

    await waitFor(() => expect(router.state.location.pathname).toBe(`/goals/${marathon.id}`));
    expect(api.sent('POST', '/habits')[0]?.body).toMatchObject({
      goalId: marathon.id,
      type: 'COUNT',
      targetValue: 12,
      unit: 'minutes',
      scheduleType: 'SPECIFIC_DAYS',
      daysOfWeek: [1, 3, 5],
    });
  });

  it('creates a duration habit times a week, in seconds, with a fixed step and limits', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/habits/new');

    await heading('New habit');
    await user.type(screen.getByLabelText('Name'), 'Meditate');
    await user.click(radio('Duration'));
    const target = screen.getByLabelText('Target (minutes)');
    await user.clear(target);
    await user.type(target, '90');
    expect(screen.getByText('= 1 h 30 min')).toBeInTheDocument();
    await user.click(radio('Times a week'));
    await user.click(screen.getByRole('button', { name: 'More times a week' }));
    expect(screen.getByText('4× a week')).toBeInTheDocument();
    await user.click(radio('Fixed amount'));
    await user.type(screen.getByLabelText('Step (minutes)'), '15');
    await user.click(screen.getByText('Advanced: limits'));
    await user.type(screen.getByLabelText('Lowest (minutes)'), '30');
    await user.type(screen.getByLabelText('Highest (minutes)'), '120');
    await user.click(radio('Evening'));
    await submit(user);

    await waitFor(() => expect(api.sent('POST', '/habits')).toHaveLength(1));
    expect(api.sent('POST', '/habits')[0]?.body).toMatchObject({
      type: 'DURATION',
      targetValue: 5400,
      scheduleType: 'TIMES_PER_WEEK',
      timesPerWeek: 4,
      timeOfDay: 'EVENING',
      stepType: 'ABSOLUTE',
      stepValue: 900,
      minTarget: 1800,
      maxTarget: 7200,
    });
  });

  it('previews the levels with the shared step math, live', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/habits/new');

    await heading('New habit');
    await user.click(radio('Duration'));
    expect(
      screen.getByText("If you're consistent: 10 → 11 → 12 → 13 min over the next 6 weeks."),
    ).toBeInTheDocument();
    const target = screen.getByLabelText('Target (minutes)');
    await user.clear(target);
    await user.type(target, '30');
    expect(
      screen.getByText("If you're consistent: 30 → 33 → 36 → 40 min over the next 6 weeks."),
    ).toBeInTheDocument();

    await user.click(radio('Yes / no'));
    await user.click(radio('Times a week'));
    expect(
      screen.getByText("If you're consistent: 3× → 4× → 5× → 6× a week over the next 6 weeks."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Adjust the target as I go' }));
    expect(screen.queryByText(/If you're consistent/)).not.toBeInTheDocument();
  });

  it('resets the fields that no longer apply when the type or schedule changes', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/habits/new');

    await heading('New habit');
    await user.click(radio('Count'));
    await user.type(screen.getByLabelText('Unit (optional)'), 'pages');
    await user.click(radio('Duration'));
    expect(screen.queryByLabelText('Unit (optional)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Target (minutes)')).toHaveValue(10);
    await user.click(radio('Count'));
    expect(screen.getByLabelText('Unit (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Target')).toHaveValue(1);

    await user.click(radio('Some days'));
    await user.click(screen.getByRole('button', { name: 'Tuesday' }));
    await user.click(radio('Every day'));
    await user.click(radio('Some days'));
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows every problem at once, in the shared schema’s words', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/habits/new');

    await heading('New habit');
    await user.click(radio('Duration'));
    const target = screen.getByLabelText('Target (minutes)');
    await user.clear(target);
    await user.type(target, '1500');
    await user.click(radio('Some days'));
    await submit(user);

    expect(await screen.findByText('Give it a name')).toBeInTheDocument();
    expect(screen.getByText('At most 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Pick at least one day')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(api.sent('POST', '/habits')).toHaveLength(0);
  });

  it('puts a server validation issue on its field', async () => {
    const { api } = setup();
    api.failNext('POST', /\/habits$/, () =>
      apiError(400, 'VALIDATION_FAILED', 'Request validation failed', {
        issues: [
          { path: 'startDate', code: 'custom', message: 'Between 6 days ago and a year from now' },
        ],
      }),
    );
    const user = userEvent.setup();
    renderApp('/habits/new');

    await heading('New habit');
    await user.type(screen.getByLabelText('Name'), 'Vitamins');
    await submit(user);

    expect(await screen.findByText('Between 6 days ago and a year from now')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toHaveAttribute('aria-invalid', 'true');
  });

  it('only offers the chosen core’s goals, and drops a goal from another core', async () => {
    const { health, career, marathon } = setup();
    const user = userEvent.setup();
    renderApp(`/habits/new?coreId=${health.id}&goalId=${marathon.id}`);

    await heading('New habit');
    const goal = screen.getByLabelText('Goal (optional)');
    expect(
      within(goal)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No goal', 'Run a half marathon']);
    await user.selectOptions(screen.getByLabelText('Core'), career.id);
    expect(goal).toHaveValue('');
    expect(
      within(goal)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['No goal', 'Get promoted']);
  });
});

describe('habit form: editing', () => {
  beforeEach(() => signedIn());

  it('locks the type and schedule, and sends only what changed', async () => {
    const { api, run, marathon } = setup();
    const user = userEvent.setup();
    const { router } = renderApp(`/habits/${run.id}/edit`);

    await heading('Edit habit');
    expect(screen.getByLabelText('Name')).toHaveValue('Morning run');
    expect(screen.getByLabelText('Target (minutes)')).toHaveValue(30);
    expect(screen.getByLabelText('Step (minutes)')).toHaveValue(5);
    expect(radio('Count')).toBeDisabled();
    expect(radio('Every day')).toBeDisabled();
    expect(screen.getByText('To change the type, create a new habit.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
    expect(screen.queryByText(/This counts as a manual change/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Run');
    await user.click(screen.getByRole('button', { name: 'Tuesday' }));
    expect(screen.getByText(/This counts as a manual change/)).toBeInTheDocument();
    await submit(user, 'Save changes');

    await waitFor(() => expect(router.state.location.pathname).toBe(`/goals/${marathon.id}`));
    expect(api.sent('PATCH', `/habits/${run.id}`)[0]?.body).toEqual({
      name: 'Run',
      daysOfWeek: [1, 2, 3, 5],
    });
  });

  it('sends nothing when nothing changed', async () => {
    const { api, run } = setup();
    const user = userEvent.setup();
    const { router } = renderApp(`/habits/${run.id}/edit`);

    await heading('Edit habit');
    await submit(user, 'Save changes');

    await waitFor(() => expect(router.state.location.pathname).not.toContain('/edit'));
    expect(api.sent('PATCH', `/habits/${run.id}`)).toHaveLength(0);
  });

  it('shows a not-found state for a habit that does not exist', async () => {
    setup();
    renderApp('/habits/00000000-0000-4000-8000-999999999999/edit');

    expect(await screen.findByText('Habit not found', {}, { timeout: 4000 })).toBeInTheDocument();
  });
});
