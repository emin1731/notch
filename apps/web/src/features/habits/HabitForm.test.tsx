import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, signedIn } from '@/test/auth';
import { renderApp } from '@/test/render';
import { fakeCore, fakeHabit, mockStructureApi } from '@/test/structure-api';

type User = ReturnType<typeof userEvent.setup>;

function setup() {
  const health = fakeCore({ name: 'Health' });
  const career = fakeCore({ name: 'Career', color: 'indigo', icon: 'briefcase' });
  const run = fakeHabit({
    coreId: health.id,
    name: 'Morning run',
    type: 'DURATION',
    targetValue: 1800,
    initialTargetValue: 1800,
    scheduleType: 'SPECIFIC_DAYS',
    daysOfWeek: [1, 3, 5],
    adaptiveEnabled: true,
    stepType: 'ABSOLUTE',
    stepValue: 300,
    minTarget: 900,
  });
  const plants = fakeHabit({ coreId: career.id, name: 'Water plants', intervalDays: 2 });
  const api = mockStructureApi({ cores: [health, career], habits: [run, plants] });
  return { api, health, career, run, plants };
}

/** The page title shows on the loading skeleton too: wait for the form itself. */
const heading = async (name: string) => {
  await screen.findByRole('heading', { level: 1, name });
  await screen.findByLabelText('Name');
};
/** Opens "Add habit" from a core's card on the Cores page; resolves to the dialog, form loaded. */
async function openNew(user: User, core = 'Health') {
  const card = await screen.findByRole('article', { name: core });
  await user.click(within(card).getByRole('button', { name: 'Add habit' }));
  const dialog = await screen.findByRole('dialog', { name: 'New habit' });
  await within(dialog).findByLabelText('Name');
  return dialog;
}
const radio = (name: string) => screen.getByRole('radio', { name });
const submit = (user: User, name = 'Add habit') => user.click(screen.getByRole('button', { name }));

describe('habit form: creating', () => {
  beforeEach(() => signedIn());

  it('opens from a core card with that core selected, and closes on save', async () => {
    const { api, career } = setup();
    const user = userEvent.setup();
    const { router } = renderApp('/cores');

    const dialog = await openNew(user, 'Career');
    expect(within(dialog).getByLabelText('Core')).toHaveValue(career.id);
    expect(
      within(dialog).getByText(/Levels work on how often you do a yes\/no habit/),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Name'), 'Vitamins');
    await submit(user);

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Added Vitamins.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cores');
    expect(
      await within(screen.getByRole('article', { name: 'Career' })).findByRole('link', {
        name: /^Vitamins/,
      }),
    ).toBeInTheDocument();
    expect(api.sent('POST', '/habits')).toHaveLength(1);
    expect(api.sent('POST', '/habits')[0]?.body).toMatchObject({
      coreId: career.id,
      name: 'Vitamins',
      type: 'TOGGLE',
      targetValue: 1,
      scheduleType: 'DAILY',
      intervalDays: 1,
      daysOfWeek: [],
      timesPerWeek: null,
      adaptiveEnabled: false,
      minTarget: null,
      maxTarget: null,
    });
  });

  it('closes on Cancel without saving anything', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/cores');

    const dialog = await openNew(user);
    await user.type(within(dialog).getByLabelText('Name'), 'Vitamins');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.sent('POST', '/habits')).toHaveLength(0);
    // It starts blank next time.
    expect(within(await openNew(user)).getByLabelText('Name')).toHaveValue('');
  });

  it('is a drawer on a phone', async () => {
    const { api, health } = setup();
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query === '(max-width: 639px)',
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const user = userEvent.setup();
    renderApp('/cores');

    const drawer = await openNew(user);
    expect(drawer).toHaveAttribute('data-vaul-drawer-direction', 'bottom');
    await user.type(within(drawer).getByLabelText('Name'), 'Vitamins');
    await submit(user);

    // Closed; jsdom never ends vaul's slide-out animation, so it stays mounted here.
    await waitFor(() => expect(drawer).toHaveAttribute('data-state', 'closed'));
    expect(await screen.findByText('Added Vitamins.')).toBeInTheDocument();
    expect(api.sent('POST', '/habits')[0]?.body).toMatchObject({
      coreId: health.id,
      name: 'Vitamins',
    });
  });

  it('creates a daily habit every few days with the interval stepper', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/cores');

    const dialog = await openNew(user);
    expect(radio('Daily')).toBeChecked();
    expect(within(dialog).getByText('Every day')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fewer days between' })).toBeDisabled();
    await user.type(screen.getByLabelText('Name'), 'Water plants');
    await user.click(screen.getByRole('button', { name: 'More days between' }));
    await user.click(screen.getByRole('button', { name: 'More days between' }));
    expect(within(dialog).getByText('Every 3 days')).toBeInTheDocument();
    await submit(user);

    await waitFor(() => expect(api.sent('POST', '/habits')).toHaveLength(1));
    expect(api.sent('POST', '/habits')[0]?.body).toMatchObject({
      name: 'Water plants',
      scheduleType: 'DAILY',
      intervalDays: 3,
      daysOfWeek: [],
      timesPerWeek: null,
    });
  });

  it('creates a count habit on some days', async () => {
    const { api, health } = setup();
    const user = userEvent.setup();
    renderApp('/cores');

    await openNew(user);
    await user.type(screen.getByLabelText('Name'), 'Stretch');
    await user.click(radio('Count'));
    const target = screen.getByLabelText('Target');
    await user.clear(target);
    await user.type(target, '12');
    await user.type(screen.getByLabelText('Unit (optional)'), 'minutes');
    await user.click(radio('Weekly'));
    for (const day of ['Friday', 'Monday', 'Wednesday']) {
      await user.click(screen.getByRole('button', { name: day }));
    }
    await submit(user);

    await waitFor(() => expect(api.sent('POST', '/habits')).toHaveLength(1));
    expect(api.sent('POST', '/habits')[0]?.body).toMatchObject({
      coreId: health.id,
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
    renderApp('/cores');

    await openNew(user);
    await user.type(screen.getByLabelText('Name'), 'Meditate');
    await user.click(radio('Duration'));
    const target = screen.getByLabelText('Target (minutes)');
    await user.clear(target);
    await user.type(target, '90');
    expect(screen.getByText('= 1 h 30 min')).toBeInTheDocument();
    await user.click(radio('Times a week'));
    await user.click(screen.getByRole('button', { name: 'More times a week' }));
    expect(screen.getByText('4× a week')).toBeInTheDocument();
    // Levels are off for a new habit; their settings show once they're on.
    expect(screen.queryByText('Step')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Adjust the target as I go' }));
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
      adaptiveEnabled: true,
      stepType: 'ABSOLUTE',
      stepValue: 900,
      minTarget: 1800,
      maxTarget: 7200,
    });
  });

  it('previews the levels with the shared step math, live', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/cores');

    await openNew(user);
    await user.click(radio('Duration'));
    const levels = screen.getByRole('switch', { name: 'Adjust the target as I go' });
    expect(levels).not.toBeChecked();
    expect(screen.queryByText(/If you're consistent/)).not.toBeInTheDocument();
    await user.click(levels);
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
    renderApp('/cores');

    await openNew(user);
    await user.click(radio('Count'));
    await user.type(screen.getByLabelText('Unit (optional)'), 'pages');
    await user.click(radio('Duration'));
    expect(screen.queryByLabelText('Unit (optional)')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Target (minutes)')).toHaveValue(10);
    await user.click(radio('Count'));
    expect(screen.getByLabelText('Unit (optional)')).toHaveValue('');
    expect(screen.getByLabelText('Target')).toHaveValue(1);

    await user.click(radio('Weekly'));
    await user.click(screen.getByRole('button', { name: 'Tuesday' }));
    await user.click(radio('Daily'));
    await user.click(radio('Weekly'));
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('shows every problem at once, in the shared schema’s words', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/cores');

    await openNew(user);
    await user.click(radio('Duration'));
    const target = screen.getByLabelText('Target (minutes)');
    await user.clear(target);
    await user.type(target, '1500');
    await user.click(radio('Weekly'));
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
    renderApp('/cores');

    await openNew(user);
    await user.type(screen.getByLabelText('Name'), 'Vitamins');
    await submit(user);

    expect(await screen.findByText('Between 6 days ago and a year from now')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('habit form: editing', () => {
  beforeEach(() => signedIn());

  it('locks the type and schedule, and sends only what changed', async () => {
    const { api, run } = setup();
    const user = userEvent.setup();
    const { router } = renderApp(`/habits/${run.id}/edit`);

    await heading('Edit habit');
    expect(screen.getByLabelText('Name')).toHaveValue('Morning run');
    expect(screen.getByLabelText('Target (minutes)')).toHaveValue(30);
    expect(screen.getByLabelText('Step (minutes)')).toHaveValue(5);
    expect(radio('Count')).toBeDisabled();
    expect(radio('Daily')).toBeDisabled();
    expect(screen.getByText('To change the type, create a new habit.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
    expect(screen.queryByText(/This counts as a manual change/)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Run');
    await user.click(screen.getByRole('button', { name: 'Tuesday' }));
    expect(screen.getByText(/This counts as a manual change/)).toBeInTheDocument();
    await submit(user, 'Save changes');

    await waitFor(() => expect(router.state.location.pathname).toBe('/cores'));
    expect(api.sent('PATCH', `/habits/${run.id}`)[0]?.body).toEqual({
      name: 'Run',
      daysOfWeek: [1, 2, 3, 5],
    });
  });

  it('keeps a daily habit’s interval editable, and sends only the new one', async () => {
    const { api, plants } = setup();
    const user = userEvent.setup();
    const { router } = renderApp(`/habits/${plants.id}/edit`);

    await heading('Edit habit');
    expect(radio('Weekly')).toBeDisabled();
    expect(
      screen.getByText(
        'To switch between Daily, Weekly and Times a week, create a new habit. You can still change its interval.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Every 2 days')).toBeInTheDocument();
    expect(screen.queryByText(/The new rhythm starts today/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'More days between' }));
    expect(screen.getByText('Every 3 days')).toBeInTheDocument();
    expect(screen.getByText(/The new rhythm starts today/)).toBeInTheDocument();
    await submit(user, 'Save changes');

    await waitFor(() => expect(router.state.location.pathname).toBe('/cores'));
    expect(api.sent('PATCH', `/habits/${plants.id}`)[0]?.body).toEqual({ intervalDays: 3 });
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
