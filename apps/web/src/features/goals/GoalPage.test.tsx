import { addDays, todayIn } from '@notch/shared';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API, apiError, signedIn, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { mockSortableLayout } from '@/test/sortable';
import { fakeCore, fakeGoal, mockStructureApi } from '@/test/structure-api';

const confetti = vi.hoisted(() => vi.fn());
vi.mock('canvas-confetti', () => ({ default: { create: () => confetti } }));

const today = todayIn(testUser.timezone, new Date());
const title = (name: string) => screen.findByRole('heading', { level: 1, name });
const progress = () => screen.getByRole('progressbar', { name: /progress$/ });
const milestoneTitles = () =>
  screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'));

function setup(goalFields: Partial<Parameters<typeof fakeGoal>[0]> = {}) {
  const health = fakeCore({ name: 'Health' });
  const career = fakeCore({ name: 'Career', color: 'indigo', icon: 'briefcase' });
  const goal = fakeGoal({
    coreId: health.id,
    title: 'Run a half marathon',
    description: 'In under two hours.',
    deadline: addDays(today, -3),
    milestones: [['Run 5 km', true], 'Run 10 km', 'Run 21 km'],
    ...goalFields,
  });
  const api = mockStructureApi({ cores: [health, career], goals: [goal] });
  return { api, goal, health, career, path: `/goals/${goal.id}` };
}

describe('goal page', () => {
  beforeEach(() => {
    signedIn();
    confetti.mockClear();
  });

  it('shows the goal with its core, deadline, progress and milestones', async () => {
    const { path } = setup();
    renderApp(path);

    expect(await title('Run a half marathon')).toBeInTheDocument();
    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText('In under two hours.')).toBeInTheDocument();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(progress()).toHaveAttribute('aria-valuetext', '1 / 3 milestones');
    expect(milestoneTitles()).toEqual(['Run 5 km', 'Run 10 km', 'Run 21 km']);
    expect(screen.getByRole('checkbox', { name: 'Run 5 km' })).toBeChecked();
  });

  it('ticks a milestone at once, before the server answers', async () => {
    const { path } = setup();
    let release: () => void = () => {};
    server.use(
      http.post(`${API}/milestones/:id/toggle`, async () => {
        await new Promise<void>((resolve) => (release = resolve));
        return HttpResponse.json({ error: 'not reached in this test' }, { status: 500 });
      }),
    );
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('checkbox', { name: 'Run 10 km' }));

    expect(screen.getByRole('checkbox', { name: 'Run 10 km' })).toBeChecked();
    expect(progress()).toHaveAttribute('aria-valuetext', '2 / 3 milestones');
    release();
  });

  it('puts the tick back, with a toast, when it cannot be saved', async () => {
    const { api, path } = setup();
    api.failNext('POST', /\/toggle$/, () => apiError(500, 'INTERNAL'));
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('checkbox', { name: 'Run 10 km' }));

    expect(await screen.findByText(/Couldn't save that/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Run 10 km' })).not.toBeChecked(),
    );
    expect(progress()).toHaveAttribute('aria-valuetext', '1 / 3 milestones');
  });

  it('celebrates once when the last milestone is ticked', async () => {
    const { path, goal } = setup();
    const user = userEvent.setup();
    const { client } = renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('checkbox', { name: 'Run 10 km' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Run 10 km' })).toBeChecked());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Run 21 km' }));

    const dialog = await screen.findByRole('dialog', { name: 'Goal done: Run a half marathon' });
    expect(dialog).toHaveTextContent("That's real change, not a checkbox.");
    await waitFor(() => expect(confetti).toHaveBeenCalledTimes(1));
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();

    // Refetching the finished goal doesn't celebrate again.
    await act(() => client.invalidateQueries({ queryKey: ['goal', goal.id] }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('archives the goal from the celebration and goes back to the cores', async () => {
    const { api, goal, path } = setup({ milestones: [['Run 5 km', true], 'Run 21 km'] });
    const user = userEvent.setup();
    const { router } = renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('checkbox', { name: 'Run 21 km' }));
    const dialog = await screen.findByRole('dialog', { name: /Goal done/ });
    await user.click(within(dialog).getByRole('button', { name: 'Archive goal' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/cores'));
    expect(api.sent('POST', `/goals/${goal.id}/archive`)).toHaveLength(1);
  });

  it('opens a new goal in the same core from the celebration', async () => {
    const { health, path } = setup({ milestones: [['Run 5 km', true], 'Run 21 km'] });
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('checkbox', { name: 'Run 21 km' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: /Goal done/ })).getByRole('button', {
        name: 'Set a new goal',
      }),
    );

    const form = await screen.findByRole('dialog', { name: 'New goal' });
    expect(within(form).getByLabelText('Core')).toHaveValue(health.id);
    expect(within(form).getByLabelText('Title')).toHaveValue('');
  });

  it('renames a milestone in place: Enter saves, Escape cancels', async () => {
    const { api, path } = setup();
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('button', { name: 'Rename Run 10 km' }));
    const input = screen.getByRole('textbox', { name: 'Milestone title' });
    await user.clear(input);
    await user.type(input, 'Run 12 km{Enter}');
    expect(await screen.findByRole('checkbox', { name: 'Run 12 km' })).toBeInTheDocument();
    expect(api.sent('PATCH', /^\/milestones\//)[0]?.body).toEqual({ title: 'Run 12 km' });

    await user.click(screen.getByRole('button', { name: 'Rename Run 21 km' }));
    await user.type(screen.getByRole('textbox', { name: 'Milestone title' }), ' extra{Escape}');
    expect(screen.getByRole('checkbox', { name: 'Run 21 km' })).toBeInTheDocument();
    expect(api.sent('PATCH', /^\/milestones\//)).toHaveLength(1);
  });

  it('adds and deletes milestones', async () => {
    const { api, path } = setup();
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    await user.type(screen.getByLabelText('New milestone'), 'Race day{Enter}');
    await waitFor(() =>
      expect(milestoneTitles()).toEqual(['Run 5 km', 'Run 10 km', 'Run 21 km', 'Race day']),
    );
    expect(screen.getByLabelText('New milestone')).toHaveValue('');
    expect(progress()).toHaveAttribute('aria-valuetext', '1 / 4 milestones');

    await user.click(screen.getByRole('button', { name: 'Delete Run 10 km' }));
    await waitFor(() => expect(milestoneTitles()).toEqual(['Run 5 km', 'Run 21 km', 'Race day']));
    expect(api.sent('DELETE', /^\/milestones\//)).toHaveLength(1);
  });

  it('says when a goal has the most milestones it can have', async () => {
    const { api, path } = setup();
    api.failNext('POST', /\/milestones$/, () => apiError(409, 'LIMIT_REACHED'));
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    await user.type(screen.getByLabelText('New milestone'), 'One more{Enter}');

    expect(await screen.findByText('A goal can have up to 50 milestones.')).toBeInTheDocument();
    expect(screen.getByLabelText('New milestone')).toHaveValue('One more');
  });

  it('reorders milestones from the keyboard', async () => {
    const { api, goal, path } = setup();
    // Read before the fake server reorders them.
    const [first, second, third] = goal.milestones.map((m) => m.id);
    mockSortableLayout();
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    screen.getByRole('button', { name: 'Reorder Run 21 km' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    await user.keyboard(' ');

    await waitFor(() => expect(milestoneTitles()).toEqual(['Run 5 km', 'Run 21 km', 'Run 10 km']));
    await waitFor(() =>
      expect(api.sent('PUT', `/goals/${goal.id}/milestones/order`)[0]?.body).toEqual({
        ids: [first, third, second],
      }),
    );
  });

  it('marks a goal without milestones complete, with a celebration', async () => {
    const { api, goal, path } = setup({ milestones: [] });
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('button', { name: 'Mark goal complete' }));

    expect(await screen.findByRole('dialog', { name: /Goal done/ })).toBeInTheDocument();
    expect(api.sent('POST', `/goals/${goal.id}/complete`)).toHaveLength(1);
  });

  it('asks before moving a goal with linked habits to another core', async () => {
    const { api, goal, career, path } = setup({
      habits: [
        { id: 'h1', name: 'Morning run', type: 'DURATION', archivedAt: null } as never,
        { id: 'h2', name: 'Stretch', type: 'CHECK', archivedAt: null } as never,
      ],
    });
    const user = userEvent.setup();
    renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('button', { name: 'Goal actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const form = await screen.findByRole('dialog', { name: 'Edit goal' });
    await user.selectOptions(within(form).getByLabelText('Core'), career.id);
    await user.click(within(form).getByRole('button', { name: 'Save' }));

    const confirm = await screen.findByRole('alertdialog', { name: 'Move its habits too?' });
    expect(confirm).toHaveTextContent(
      "2 habits are linked to this goal. They'll move to Career with it.",
    );
    await user.click(within(confirm).getByRole('button', { name: 'Move goal and habits' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const patches = api.sent('PATCH', `/goals/${goal.id}`);
    expect(patches).toHaveLength(2);
    expect(patches[1]?.body).toMatchObject({ coreId: career.id, moveHabits: true });
    expect(await screen.findByText('Career')).toBeInTheDocument();
  });

  it('deletes the goal and goes back to the cores', async () => {
    const { api, goal, path } = setup();
    const user = userEvent.setup();
    const { router } = renderApp(path);
    await title('Run a half marathon');

    await user.click(screen.getByRole('button', { name: 'Goal actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete Run a half marathon?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete goal' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/cores'));
    expect(api.sent('DELETE', `/goals/${goal.id}`)).toHaveLength(1);
  });

  it('shows a not-found page for a goal that does not exist', async () => {
    mockStructureApi();
    renderApp('/goals/00000000-0000-4000-8000-999999999999');

    expect(await screen.findByText('Goal not found', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Cores & Goals' })).toHaveAttribute(
      'href',
      '/cores',
    );
  });

  it('keeps an archived goal read-only', async () => {
    const { path } = setup({ archivedAt: '2026-11-18T09:00:00.000Z' });
    renderApp(path);
    await title('Run a half marathon');

    expect(
      screen.getByText('This goal is archived. Unarchive it to make changes.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Run 10 km' })).toBeDisabled();
    expect(screen.queryByLabelText('New milestone')).not.toBeInTheDocument();
    await delay(0);
  });
});
