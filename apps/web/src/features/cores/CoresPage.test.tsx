import { addDays, todayIn } from '@notch/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, signedIn, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { mockSortableLayout } from '@/test/sortable';
import { fakeCore, fakeGoal, mockStructureApi } from '@/test/structure-api';

const today = todayIn(testUser.timezone, new Date());
const card = (name: string) => screen.findByRole('article', { name });
const cardNames = () =>
  screen.getAllByRole('article').map((article) => within(article).getByRole('heading').textContent);

function setup() {
  const health = fakeCore({ name: 'Health', color: 'emerald', icon: 'heart-pulse' });
  const career = fakeCore({ name: 'Career', color: 'indigo', icon: 'briefcase' });
  const marathon = fakeGoal({
    coreId: health.id,
    title: 'Run a half marathon',
    deadline: addDays(today, 12),
    milestones: [['Run 5 km', true], 'Run 10 km', 'Run 21 km'],
  });
  const sleep = fakeGoal({
    coreId: health.id,
    title: 'Sleep 8 hours',
    milestones: [['Buy blinds', true]],
  });
  const api = mockStructureApi({ cores: [health, career], goals: [marathon, sleep] });
  return { api, health, career, marathon, sleep };
}

describe('Cores & Goals page', () => {
  beforeEach(() => signedIn());

  it('shows each core with its active goals, progress and deadline, and folds away completed ones', async () => {
    setup();
    renderApp('/cores');

    const health = await card('Health');
    expect(cardNames()).toEqual(['Health', 'Career']);
    const marathon = within(health).getByRole('link', { name: /Run a half marathon/ });
    expect(marathon).toHaveAttribute('href', expect.stringMatching(/^\/goals\//));
    expect(within(marathon).getByText('12 days left')).toBeInTheDocument();
    expect(
      within(health).getByRole('progressbar', { name: 'Run a half marathon progress' }),
    ).toHaveAttribute('aria-valuetext', '1 / 3 milestones');
    expect(within(health).getByText('Completed (1)')).toBeInTheDocument();
    expect(within(await card('Career')).getByText('No goals or habits yet.')).toBeInTheDocument();
  });

  it('creates a core in one click from the empty state', async () => {
    const api = mockStructureApi();
    const user = userEvent.setup();
    renderApp('/cores');

    await screen.findByRole('heading', { name: 'Start with a core' });
    await user.click(screen.getByRole('button', { name: 'Mind' }));

    expect(await card('Mind')).toBeInTheDocument();
    expect(api.sent('POST', '/cores')[0]?.body).toEqual({
      name: 'Mind',
      color: 'violet',
      icon: 'brain',
    });
  });

  it('creates a core with a chosen color and a searched icon', async () => {
    const { api } = setup();
    const user = userEvent.setup();
    renderApp('/cores');
    await card('Health');

    await user.click(screen.getByRole('button', { name: 'Add core' }));
    const dialog = await screen.findByRole('dialog', { name: 'New core' });
    await user.click(within(dialog).getByRole('button', { name: 'Create core' }));
    expect(await within(dialog).findByText('Give it a name')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Name'), 'Rest');
    await user.click(within(dialog).getByRole('radio', { name: 'Rose' }));
    await user.type(within(dialog).getByLabelText('Search icons'), 'sleep');
    expect(within(dialog).queryByRole('radio', { name: 'Briefcase' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('radio', { name: 'Bed' }));
    await user.click(within(dialog).getByRole('button', { name: 'Create core' }));

    expect(await card('Rest')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(api.sent('POST', '/cores')[0]?.body).toEqual({
      name: 'Rest',
      color: 'rose',
      icon: 'bed',
    });
  });

  it('edits a core from its menu', async () => {
    const { api, career } = setup();
    const user = userEvent.setup();
    renderApp('/cores');

    await user.click(within(await card('Career')).getByRole('button', { name: 'Career actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit core' });
    const name = within(dialog).getByLabelText('Name');
    expect(name).toHaveValue('Career');
    await user.clear(name);
    await user.type(name, 'Work');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await card('Work')).toBeInTheDocument();
    expect(api.sent('PATCH', `/cores/${career.id}`)[0]?.body).toEqual({
      name: 'Work',
      color: 'indigo',
      icon: 'briefcase',
    });
  });

  it('explains why a core with goals cannot be deleted', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/cores');

    await user.click(within(await card('Health')).getByRole('button', { name: 'Health actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete Health?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete core' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'This core still has goals or habits, archived ones included.',
    );
    // Behind the open dialog, so hidden from the accessibility tree.
    expect(screen.getByRole('article', { name: 'Health', hidden: true })).toBeInTheDocument();
  });

  it('deletes an empty core', async () => {
    const { api, career } = setup();
    const user = userEvent.setup();
    renderApp('/cores');

    await user.click(within(await card('Career')).getByRole('button', { name: 'Career actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await user.click(await screen.findByRole('button', { name: 'Delete core' }));

    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Career' })).not.toBeInTheDocument(),
    );
    expect(api.sent('DELETE', `/cores/${career.id}`)).toHaveLength(1);
  });

  it('archives a core with its goals, and shows them again with "Show archived"', async () => {
    setup();
    const user = userEvent.setup();
    renderApp('/cores');

    await user.click(within(await card('Health')).getByRole('button', { name: 'Health actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Archive' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Archive Health?' });
    expect(dialog).toHaveTextContent('Its goals and habits are archived with it');
    await user.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: 'Health' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('switch', { name: 'Show archived' }));
    const archived = await card('Health');
    expect(within(archived).getByText('Archived')).toBeInTheDocument();
    expect(within(archived).getByText('Archived (2)')).toBeInTheDocument();
    // An archived core takes no new goals.
    expect(within(archived).queryByRole('button', { name: 'Add goal' })).not.toBeInTheDocument();

    await user.click(within(archived).getByRole('button', { name: 'Health actions' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Unarchive' }));
    expect(await screen.findByText(/Health is back/)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(screen.getByRole('article', { name: 'Health' })).queryByText('Archived'),
      ).not.toBeInTheDocument(),
    );
  });

  it('reorders cores from the keyboard', async () => {
    const { api, health, career } = setup();
    mockSortableLayout();
    const user = userEvent.setup();
    renderApp('/cores');
    await card('Career');

    screen.getByRole('button', { name: 'Reorder Career' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    await user.keyboard(' ');

    await waitFor(() => expect(cardNames()).toEqual(['Career', 'Health']));
    await waitFor(() =>
      expect(api.sent('PUT', '/cores/order')[0]?.body).toEqual({ ids: [career.id, health.id] }),
    );
  });

  it('puts the cores back if the new order cannot be saved', async () => {
    const { api } = setup();
    api.failNext('PUT', /\/cores\/order$/, () => apiError(500, 'INTERNAL'));
    mockSortableLayout();
    const user = userEvent.setup();
    renderApp('/cores');
    await card('Career');

    screen.getByRole('button', { name: 'Reorder Career' }).focus();
    await user.keyboard(' ');
    await user.keyboard('{ArrowUp}');
    await user.keyboard(' ');

    expect(await screen.findByText(/Couldn't save the new order/)).toBeInTheDocument();
    await waitFor(() => expect(cardNames()).toEqual(['Health', 'Career']));
  });

  it('adds a goal with inline milestones from a core card', async () => {
    const { api, career } = setup();
    const user = userEvent.setup();
    renderApp('/cores');

    await user.click(within(await card('Career')).getByRole('button', { name: 'Add goal' }));
    const dialog = await screen.findByRole('dialog', { name: 'New goal' });
    expect(within(dialog).getByLabelText('Core')).toHaveValue(career.id);
    await user.type(within(dialog).getByLabelText('Title'), 'Get promoted');
    const milestone = within(dialog).getByLabelText('Milestones (optional)');
    await user.type(milestone, 'Lead a project{Enter}');
    await user.type(milestone, 'Mentor someone{Enter}');
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove milestone Lead a project' }),
    );
    await user.type(milestone, 'Ship the launch{Enter}');
    await user.click(within(dialog).getByRole('button', { name: 'Create goal' }));

    expect(
      await within(await card('Career')).findByRole('link', { name: /Get promoted/ }),
    ).toBeInTheDocument();
    expect(api.sent('POST', '/goals')[0]?.body).toEqual({
      coreId: career.id,
      title: 'Get promoted',
      milestones: ['Mentor someone', 'Ship the launch'],
    });
  });

  it('shows an error with a way to retry when the cores cannot load', async () => {
    setup();
    const api = mockStructureApi();
    api.failNext('GET', /\/cores$/, () => HttpResponse.error());
    api.failNext('GET', /\/cores$/, () => HttpResponse.error());
    renderApp('/cores');

    expect(
      await screen.findByText("Couldn't load your cores", {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
