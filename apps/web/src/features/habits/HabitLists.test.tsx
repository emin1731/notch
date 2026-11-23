import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { signedIn } from '@/test/auth';
import { renderApp } from '@/test/render';
import { mockSortableLayout } from '@/test/sortable';
import { fakeCore, fakeHabit, mockStructureApi } from '@/test/structure-api';

function setup() {
  const health = fakeCore({ name: 'Health' });
  const vitamins = fakeHabit({ coreId: health.id, name: 'Vitamins' });
  const water = fakeHabit({
    coreId: health.id,
    name: 'Water',
    type: 'COUNT',
    targetValue: 8,
    unit: 'glasses',
    scheduleType: 'SPECIFIC_DAYS',
    daysOfWeek: [1, 2, 3, 4, 5],
  });
  const run = fakeHabit({
    coreId: health.id,
    name: 'Morning run',
    type: 'DURATION',
    targetValue: 1800,
    scheduleType: 'TIMES_PER_WEEK',
    timesPerWeek: 3,
  });
  const api = mockStructureApi({ cores: [health], habits: [vitamins, water, run] });
  return { api, health, vitamins, water, run };
}

const card = () => screen.findByRole('article', { name: 'Health' });
const habitNames = (container: HTMLElement) =>
  within(container)
    .queryAllByRole('link', { name: /./ })
    .filter((link) => /^\/habits\/[0-9a-f-]+$/.test(link.getAttribute('href') ?? ''))
    .map((link) => link.querySelector('.font-medium')?.textContent);

describe('habits on a core card', () => {
  beforeEach(() => signedIn());

  it('lists the core’s habits, with when and how much', async () => {
    const { health } = setup();
    renderApp('/cores');

    const habits = await within(await card()).findByRole('region', { name: 'Health habits' });
    expect(habitNames(habits)).toEqual(['Vitamins', 'Water', 'Morning run']);
    expect(within(habits).getByText('Every day')).toBeInTheDocument();
    expect(within(habits).getByText('Weekdays · 8 glasses')).toBeInTheDocument();
    expect(within(habits).getByText('3× a week · 30 min')).toBeInTheDocument();
    expect(within(await card()).getByRole('link', { name: 'Add habit' })).toHaveAttribute(
      'href',
      `/habits/new?coreId=${health.id}`,
    );
  });

  it('reorders habits from the keyboard', async () => {
    const { api, vitamins, water, run } = setup();
    mockSortableLayout();
    const user = userEvent.setup();
    renderApp('/cores');
    await within(await card()).findByRole('region', { name: 'Health habits' });

    screen.getByRole('button', { name: 'Reorder Water' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    await user.keyboard(' ');

    await waitFor(() =>
      expect(api.sent('PUT', '/habits/order')[0]?.body).toEqual({
        ids: [water.id, vitamins.id, run.id],
      }),
    );
    expect(habitNames(screen.getByRole('region', { name: 'Health habits' }))).toEqual([
      'Water',
      'Vitamins',
      'Morning run',
    ]);
  });

  it('archives a habit, and brings it back with "Show archived"', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/cores');
    await within(await card()).findByRole('region', { name: 'Health habits' });

    await user.click(screen.getByRole('button', { name: 'Vitamins actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    expect(await screen.findByText(/Vitamins is archived/)).toBeInTheDocument();
    await waitFor(() =>
      expect(habitNames(screen.getByRole('region', { name: 'Health habits' }))).toEqual([
        'Water',
        'Morning run',
      ]),
    );

    await user.click(screen.getByRole('switch', { name: 'Show archived' }));
    const habits = await screen.findByRole('region', { name: 'Health habits' });
    await waitFor(() => expect(habitNames(habits)).toEqual(['Vitamins', 'Water', 'Morning run']));
    expect(within(habits).getByText('Archived')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Vitamins actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Unarchive' }));
    expect(await screen.findByText('Vitamins is back.')).toBeInTheDocument();
  });

  it('deletes a habit after a confirmation that says what is lost', async () => {
    const { api, water } = setup();
    const user = userEvent.setup();
    renderApp('/cores');
    await within(await card()).findByRole('region', { name: 'Health habits' });

    await user.click(screen.getByRole('button', { name: 'Water actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Water?' });
    expect(dialog).toHaveTextContent('This deletes its logs and level history.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete habit' }));

    await waitFor(() =>
      expect(habitNames(screen.getByRole('region', { name: 'Health habits' }))).toEqual([
        'Vitamins',
        'Morning run',
      ]),
    );
    expect(api.sent('DELETE', `/habits/${water.id}`)).toHaveLength(1);
  });

  it('opens the edit form from the menu', async () => {
    const { water } = setup();
    const user = userEvent.setup();
    const { router } = renderApp('/cores');
    await within(await card()).findByRole('region', { name: 'Health habits' });

    await user.click(screen.getByRole('button', { name: 'Water actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/habits/${water.id}/edit`));
  });
});
