/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies in a test fake */
import type { UserDto } from '@notch/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, apiError, signedIn, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';
import { fakeCore, fakeHabit, mockStructureApi } from '@/test/structure-api';

const PASSWORD = 'correct horse battery';

/** `/me` and `/auth/logout-all` over one user; the password is `PASSWORD`. */
function mockAccountApi(user: UserDto = testUser) {
  const calls: { method: string; path: string; body: any }[] = [];
  let current = user;
  const body = async (request: Request) =>
    request
      .clone()
      .json()
      .catch(() => undefined);
  server.use(
    http.patch(`${API}/me`, async ({ request }) => {
      const input = await body(request);
      calls.push({ method: 'PATCH', path: '/me', body: input });
      current = { ...current, ...input };
      return HttpResponse.json(current);
    }),
    http.post(`${API}/me/password`, async ({ request }) => {
      const input = await body(request);
      calls.push({ method: 'POST', path: '/me/password', body: input });
      return input.currentPassword === PASSWORD
        ? new HttpResponse(null, { status: 204 })
        : apiError(403, 'INVALID_CREDENTIALS', 'Current password is incorrect');
    }),
    http.post(`${API}/auth/logout-all`, () => {
      calls.push({ method: 'POST', path: '/auth/logout-all', body: undefined });
      return new HttpResponse(null, { status: 204 });
    }),
    http.delete(`${API}/me`, async ({ request }) => {
      const input = await body(request);
      calls.push({ method: 'DELETE', path: '/me', body: input });
      return input.password === PASSWORD
        ? new HttpResponse(null, { status: 204 })
        : apiError(403, 'INVALID_CREDENTIALS', 'Password is incorrect');
    }),
  );
  return { calls };
}

const section = (name: string) => screen.findByRole('region', { name });

describe('settings', () => {
  beforeEach(() => {
    signedIn();
    mockStructureApi();
  });

  it('saves the name, and clears it back to the username', async () => {
    const api = mockAccountApi();
    const user = userEvent.setup();
    renderApp('/settings');

    const profile = await section('Profile');
    expect(profile).toHaveTextContent('@emin');
    const name = within(profile).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Emin D');
    await user.click(within(profile).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();

    await user.clear(name);
    await user.click(within(profile).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(api.calls.map((call) => call.body)).toEqual([{ name: 'Emin D' }, { name: null }]),
    );
  });

  it('changes the timezone from the list', async () => {
    const api = mockAccountApi();
    const user = userEvent.setup();
    renderApp('/settings');

    const timezone = await section('Timezone');
    // The device and the account agree: no prompt.
    expect(within(timezone).queryByText(/Your device is on/)).not.toBeInTheDocument();
    await user.selectOptions(within(timezone).getByLabelText('Timezone'), 'Europe/Berlin');
    await user.click(within(timezone).getByRole('button', { name: 'Save timezone' }));
    expect(
      await screen.findByText('Timezone updated. Today now follows Europe/Berlin.'),
    ).toBeInTheDocument();
    expect(api.calls).toEqual([
      { method: 'PATCH', path: '/me', body: { timezone: 'Europe/Berlin' } },
    ]);
  });

  it('puts a wrong current password on its field, and confirms a change', async () => {
    const api = mockAccountApi();
    const user = userEvent.setup();
    renderApp('/settings');

    const password = await section('Password');
    await user.type(within(password).getByLabelText('Current password'), 'nope nope nope');
    await user.type(within(password).getByLabelText('New password'), 'a brand new one');
    await user.click(within(password).getByRole('button', { name: 'Change password' }));
    expect(await within(password).findByText('That password isn’t right.')).toBeInTheDocument();

    await user.clear(within(password).getByLabelText('Current password'));
    await user.type(within(password).getByLabelText('Current password'), PASSWORD);
    await user.click(within(password).getByRole('button', { name: 'Change password' }));
    expect(
      await screen.findByText('Password changed. Your other devices were logged out.'),
    ).toBeInTheDocument();
    expect(within(password).getByLabelText('Current password')).toHaveValue('');
    expect(api.calls.at(-1)?.body).toEqual({
      currentPassword: PASSWORD,
      newPassword: 'a brand new one',
    });
  });

  it('switches the theme', async () => {
    const user = userEvent.setup();
    renderApp('/settings');

    const theme = await section('Theme');
    await user.click(within(theme).getByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveClass('dark');
    await user.click(within(theme).getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('says when nothing is archived', async () => {
    renderApp('/settings');
    expect(
      await screen.findByText('Nothing archived. Archived cores and habits show up here.'),
    ).toBeInTheDocument();
  });

  it('logs out everywhere, after asking', async () => {
    const api = mockAccountApi();
    const user = userEvent.setup();
    const { router } = renderApp('/settings');

    await user.click(
      within(await section('Danger zone')).getByRole('button', { name: 'Log out everywhere' }),
    );
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Log out everywhere',
      }),
    );

    await screen.findByRole('heading', { name: 'Log in' });
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByText('Logged out everywhere.')).toBeInTheDocument();
    expect(api.calls.map((call) => call.path)).toEqual(['/auth/logout-all']);
  });

  it('deletes the account with the password, and not without it', async () => {
    const api = mockAccountApi();
    const user = userEvent.setup();
    const { router } = renderApp('/settings');

    await user.click(
      within(await section('Danger zone')).getByRole('button', { name: 'Delete account' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Delete your account?' });
    await user.type(within(dialog).getByLabelText('Password'), 'not it at all');
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));
    expect(await within(dialog).findByText('That password isn’t right.')).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Password'));
    await user.type(within(dialog).getByLabelText('Password'), PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));

    await screen.findByRole('heading', { name: 'Log in' });
    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByText('Your account was deleted.')).toBeInTheDocument();
    expect(api.calls.map((call) => call.body)).toEqual([
      { password: 'not it at all' },
      { password: PASSWORD },
    ]);
  });
});

describe('settings: archived', () => {
  it('unarchives each kind, a habit only once its core is back', async () => {
    signedIn();
    const health = fakeCore({ name: 'Health', archivedAt: '2026-11-10T09:00:00.000Z' });
    const mind = fakeCore({ name: 'Mind' });
    const run = fakeHabit({
      coreId: health.id,
      name: 'Morning run',
      archivedAt: '2026-11-10T09:00:00.000Z',
    });
    const journal = fakeHabit({
      coreId: mind.id,
      name: 'Journal',
      archivedAt: '2026-11-12T09:00:00.000Z',
    });
    const api = mockStructureApi({ cores: [health, mind], habits: [run, journal] });
    const user = userEvent.setup();
    renderApp('/settings');

    const archived = await section('Archived');
    expect(
      await within(archived).findByRole('button', { name: 'Unarchive Morning run' }),
    ).toBeDisabled();
    expect(archived).toHaveTextContent('In Health, which is archived: unarchive it first.');

    await user.click(within(archived).getByRole('button', { name: 'Unarchive Journal' }));
    await waitFor(() =>
      expect(within(archived).queryByRole('button', { name: 'Unarchive Journal' })).toBeNull(),
    );

    await user.click(within(archived).getByRole('button', { name: 'Unarchive Health' }));
    await waitFor(() =>
      expect(within(archived).getByRole('button', { name: 'Unarchive Morning run' })).toBeEnabled(),
    );
    expect(api.sent('POST', `/habits/${journal.id}/unarchive`)).toHaveLength(1);
    expect(api.sent('POST', `/cores/${health.id}/unarchive`)).toHaveLength(1);
  });
});

describe('timezone banner on Today', () => {
  // The tests' device is on Asia/Baku (vite.config.ts); this account says UTC.
  const traveller = { ...testUser, timezone: 'UTC' };

  it('offers the device’s timezone, in Settings too', async () => {
    signedIn(traveller);
    mockStructureApi();
    const api = mockAccountApi(traveller);
    const user = userEvent.setup();
    renderApp('/today');

    const banner = await section('Timezone');
    expect(banner).toHaveTextContent(
      'Your device is on Asia/Baku but your account uses UTC. Update?',
    );
    await user.click(within(banner).getByRole('button', { name: 'Use Asia/Baku' }));
    expect(
      await screen.findByText('Timezone updated. Today now follows Asia/Baku.'),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Timezone' })).toBeNull());
    expect(api.calls).toEqual([{ method: 'PATCH', path: '/me', body: { timezone: 'Asia/Baku' } }]);
  });

  it('remembers "Not now" for this device timezone', async () => {
    signedIn(traveller);
    mockStructureApi();
    const user = userEvent.setup();
    const first = renderApp('/today');

    await user.click(within(await section('Timezone')).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Timezone' })).not.toBeInTheDocument();
    first.unmount();

    renderApp('/today');
    await screen.findByRole('heading', { level: 1, name: 'Today' });
    expect(screen.queryByRole('region', { name: 'Timezone' })).not.toBeInTheDocument();
  });

  it('still shows the mismatch in Settings after "Not now"', async () => {
    signedIn(traveller);
    mockStructureApi();
    localStorage.setItem('notch-timezone-dismissed', 'Asia/Baku');
    renderApp('/settings');
    expect(await section('Timezone')).toHaveTextContent(
      'Your device is on Asia/Baku but your account uses UTC. Update?',
    );
  });
});
