/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies in a test fake */
import type { UserDto } from '@notch/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, apiError, signedIn, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { fakeCore, mockStructureApi, nextId } from '@/test/structure-api';
import { ONBOARDING_STORAGE_KEY, useOnboarding } from './onboarding-store';

const newUser: UserDto = { ...testUser, onboardedAt: null };

/**
 * The calls onboarding makes, recorded with their bodies. `failNext(path)` fails the next request
 * to it once.
 */
function mockOnboardingApi() {
  const calls: { path: string; body: any }[] = [];
  const failing = new Set<string>();
  const record = async (path: string, request: Request) => {
    const body = await request
      .clone()
      .json()
      .catch(() => null);
    calls.push({ path, body });
    if (failing.delete(path)) {
      return apiError(503, 'SERVICE_UNAVAILABLE', 'Try again in a moment');
    }
    return null;
  };
  server.use(
    http.post(`${API}/cores/batch`, async ({ request }) => {
      const failed = await record('/cores/batch', request);
      if (failed) return failed;
      const { cores } = calls.at(-1)!.body as { cores: object[] };
      return HttpResponse.json(
        cores.map((core) => ({ ...core, id: nextId() })),
        { status: 201 },
      );
    }),
    http.post(`${API}/habits`, async ({ request }) => {
      const failed = await record('/habits', request);
      return failed ?? HttpResponse.json({ id: nextId() }, { status: 201 });
    }),
    http.post(`${API}/me/onboarding/complete`, async ({ request }) => {
      const failed = await record('/me/onboarding/complete', request);
      return failed ?? HttpResponse.json({ ...newUser, onboardedAt: '2026-11-20T09:00:00.000Z' });
    }),
  );
  return {
    calls,
    bodies: (path: string) => calls.filter((call) => call.path === path).map((call) => call.body),
    failNext: (path: string) => failing.add(path),
  };
}

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

async function pickCores(user: ReturnType<typeof userEvent.setup>, ...names: string[]) {
  await heading('What do you want to grow in?');
  for (const name of names) {
    await user.click(screen.getByRole('button', { name }));
  }
}

describe('onboarding guards', () => {
  it('sends someone who hasn’t onboarded to onboarding', async () => {
    signedIn(newUser);
    mockStructureApi();
    const { router } = renderApp('/today');
    await heading('What do you want to grow in?');
    expect(router.state.location.pathname).toBe('/onboarding');
  });

  it('sends someone who has onboarded to Today', async () => {
    signedIn();
    mockStructureApi();
    const { router } = renderApp('/onboarding');
    await heading('Today');
    expect(router.state.location.pathname).toBe('/today');
  });
});

describe('onboarding', () => {
  beforeEach(() => {
    signedIn(newUser);
    mockStructureApi();
  });

  it('goes from cores to Today, creating everything picked', async () => {
    const api = mockOnboardingApi();
    const user = userEvent.setup();
    const { router } = renderApp('/onboarding');

    // Step 1: a preset and a core of your own.
    await pickCores(user, 'Health');
    await user.click(screen.getByRole('button', { name: 'Add your own' }));
    const coreDialog = await screen.findByRole('dialog');
    await user.type(within(coreDialog).getByLabelText('Name'), 'Music');
    await user.click(within(coreDialog).getByRole('button', { name: 'Add core' }));
    expect(
      within(screen.getByRole('list', { name: 'Your cores' }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['Health', 'Music']);
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2: a suggestion, and a habit of your own.
    await heading('Your first habits');
    const health = screen.getByRole('region', { name: 'Health' });
    await user.click(within(health).getByRole('button', { name: /^Walk/ }));
    expect(within(health).getByRole('button', { name: /^Walk/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const music = screen.getByRole('region', { name: 'Music' });
    expect(within(music).queryByRole('group')).not.toBeInTheDocument();
    await user.click(within(music).getByRole('button', { name: 'Create your own' }));
    const habitDialog = await screen.findByRole('dialog');
    await user.type(within(habitDialog).getByLabelText('Name'), 'Scales');
    await user.click(within(habitDialog).getByRole('radio', { name: 'Count' }));
    await user.clear(within(habitDialog).getByLabelText('Target'));
    await user.type(within(habitDialog).getByLabelText('Target'), '3');
    await user.type(within(habitDialog).getByLabelText('Unit (optional)'), 'rounds');
    await user.click(within(habitDialog).getByRole('button', { name: 'Add habit' }));
    expect(within(music).getByRole('list')).toHaveTextContent('Scales · 3 rounds · Every day');
    expect(screen.getByText('2 habits picked.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 3, then Start.
    await heading('How levels work');
    await user.click(screen.getByRole('button', { name: 'Start' }));

    await heading('Today');
    expect(router.state.location.pathname).toBe('/today');
    expect(api.calls.map((call) => call.path)).toEqual([
      '/cores/batch',
      '/habits',
      '/habits',
      '/me/onboarding/complete',
    ]);
    expect(api.bodies('/cores/batch')[0].cores).toEqual([
      { name: 'Health', color: 'emerald', icon: 'heart-pulse' },
      // A core of your own starts in a color the others don't have.
      { name: 'Music', color: 'sky', icon: 'target' },
    ]);
    expect(api.bodies('/habits')).toEqual([
      expect.objectContaining({ name: 'Walk', type: 'DURATION', targetValue: 1200 }),
      expect.objectContaining({ name: 'Scales', type: 'COUNT', targetValue: 3, unit: 'rounds' }),
    ]);
  });

  it('needs a core, and takes a preset back off', async () => {
    const user = userEvent.setup();
    renderApp('/onboarding');

    await heading('What do you want to grow in?');
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Pick at least one core to continue.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mind' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: /^Mind/ }));
    expect(screen.queryByRole('list', { name: 'Your cores' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('skips the habits', async () => {
    const api = mockOnboardingApi();
    const user = userEvent.setup();
    renderApp('/onboarding');

    await pickCores(user, 'Mind');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await heading('Your first habits');
    await user.click(screen.getByRole('button', { name: 'Skip for now' }));
    await user.click(await screen.findByRole('button', { name: 'Start' }));

    await heading('Today');
    expect(api.calls.map((call) => call.path)).toEqual(['/cores/batch', '/me/onboarding/complete']);
  });

  it('suggests starting small above five habits', async () => {
    const user = userEvent.setup();
    renderApp('/onboarding');

    await pickCores(user, 'Health', 'Mind', 'Learning');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await heading('Your first habits');
    const suggestions = screen
      .getAllByRole('group')
      .flatMap((group) => within(group).getAllByRole('button'));
    for (const suggestion of suggestions.slice(0, 5)) {
      await user.click(suggestion);
    }
    const warning = 'Starting small makes it stick. You can add more anytime.';
    expect(screen.queryByText(warning)).not.toBeInTheDocument();
    await user.click(suggestions[5]!);
    expect(screen.getByText(warning)).toBeInTheDocument();
    // A suggestion only: the next step is still open.
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('retries a failed habit without creating anything twice', async () => {
    const api = mockOnboardingApi();
    const user = userEvent.setup();
    renderApp('/onboarding');

    await pickCores(user, 'Mind');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await heading('Your first habits');
    await user.click(screen.getByRole('button', { name: /^Meditate/ }));
    await user.click(screen.getByRole('button', { name: /^Journal/ }));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    // The first habit saves, the second fails: back on the habits step, the first one locked.
    api.calls.length = 0;
    let habitRequests = 0;
    server.use(
      http.post(`${API}/habits`, () => {
        habitRequests += 1;
        return habitRequests === 2
          ? apiError(503, 'SERVICE_UNAVAILABLE', 'Try again in a moment')
          : HttpResponse.json({ id: nextId() }, { status: 201 });
      }),
    );
    await user.click(await screen.findByRole('button', { name: 'Start' }));

    expect(await screen.findByText(/Couldn’t save your habits/)).toBeInTheDocument();
    await heading('Your first habits');
    expect(screen.getByRole('button', { name: /^Meditate/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await heading('Today');
    expect(api.bodies('/cores/batch')).toHaveLength(1);
    expect(habitRequests).toBe(3);
  });

  it('keeps the picks across a reload', async () => {
    const user = userEvent.setup();
    const first = renderApp('/onboarding');
    await pickCores(user, 'Finance');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await heading('Your first habits');
    first.unmount();

    renderApp('/onboarding');
    await heading('Your first habits');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      within(await screen.findByRole('list', { name: 'Your cores' })).getByText('Finance'),
    ).toBeInTheDocument();
  });

  it('picks up a draft saved when there was a goal step, without the goal', async () => {
    sessionStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        version: 0,
        state: {
          userId: newUser.id,
          step: 3,
          cores: [
            { key: 'preset:Mind', preset: 'Mind', name: 'Mind', color: 'violet', icon: 'brain' },
          ],
          goal: { coreKey: 'preset:Mind', title: 'Read 12 books', deadline: null, milestones: [] },
          habits: [],
          created: { cores: {}, goalId: null, habits: {} },
        },
      }),
    );
    await useOnboarding.persist.rehydrate();
    const api = mockOnboardingApi();
    const user = userEvent.setup();
    renderApp('/onboarding');

    await heading('How levels work');
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start' }));
    await heading('Today');
    expect(api.calls.map((call) => call.path)).toEqual(['/cores/batch', '/me/onboarding/complete']);
  });

  it('lets someone with cores already skip the setup', async () => {
    mockStructureApi({ cores: [fakeCore({ name: 'Health' }), fakeCore({ name: 'Career' })] });
    const api = mockOnboardingApi();
    const user = userEvent.setup();
    const { router } = renderApp('/onboarding');

    expect(
      await screen.findByText('You already have 2 cores. Skip the setup and go to Today.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I’m already set up' }));
    await heading('Today');
    expect(router.state.location.pathname).toBe('/today');
    expect(api.calls.map((call) => call.path)).toEqual(['/me/onboarding/complete']);
  });
});

describe('onboarding errors', () => {
  it('shows a failed core batch on the cores step', async () => {
    signedIn(newUser);
    mockStructureApi();
    const api = mockOnboardingApi();
    api.failNext('/cores/batch');
    const user = userEvent.setup();
    renderApp('/onboarding');

    await pickCores(user, 'Mind');
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(await screen.findByRole('button', { name: 'Skip for now' }));
    await user.click(await screen.findByRole('button', { name: 'Start' }));

    await heading('What do you want to grow in?');
    expect(screen.getByText(/Couldn’t save your cores/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(api.calls.map((call) => call.path)).toEqual([
        '/cores/batch',
        '/cores/batch',
        '/me/onboarding/complete',
      ]),
    );
  });
});
