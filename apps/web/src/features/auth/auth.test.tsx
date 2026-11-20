import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { API, apiError, signedIn, signedOut, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

async function logIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Username'), ' Emin ');
  await user.type(screen.getByLabelText('Password'), 'correct horse');
  await user.click(screen.getByRole('button', { name: 'Log in' }));
}

describe('auth', () => {
  it('renders nothing while the session is being checked, so the login page never flashes', async () => {
    server.use(
      http.get(`${API}/auth/me`, async () => {
        await delay('infinite');
        return HttpResponse.json(testUser);
      }),
    );
    document.cookie = 'XSRF-TOKEN=t; path=/';
    renderApp('/today');

    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('sends a logged-out visitor to log in, then back to the page they asked for', async () => {
    signedOut();
    let body: unknown;
    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(testUser);
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/stats?range=30d');

    await heading('Log in');
    expect(router.state.location.pathname).toBe('/login');
    await logIn(user);

    expect(await heading('Stats')).toBeInTheDocument();
    expect(router.state.location.pathname + router.state.location.search).toBe('/stats?range=30d');
    // The shared schema normalises the username before it's sent.
    expect(body).toEqual({ username: 'emin', password: 'correct horse' });
  });

  it('shows wrong login details on the form', async () => {
    signedOut();
    server.use(
      http.post(`${API}/auth/login`, () =>
        apiError(401, 'INVALID_CREDENTIALS', 'Invalid username or password'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/login');

    await heading('Log in');
    await logIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That username and password don't match.",
    );
  });

  it('checks the login form with the shared schema before sending anything', async () => {
    signedOut();
    const user = userEvent.setup();
    renderApp('/login');

    await heading('Log in');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Enter your username')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveAttribute('aria-invalid', 'true');
  });

  it('sends a logged-in user away from the guest pages', async () => {
    signedIn();
    const { router } = renderApp('/login');

    expect(await heading('Today')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/today');
  });

  it('tells an unreachable server apart from being logged out, and recovers', async () => {
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.error()));
    document.cookie = 'XSRF-TOKEN=t; path=/';
    const user = userEvent.setup();
    renderApp('/today');

    expect(await heading("Can't reach notch")).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Log in' })).not.toBeInTheDocument();

    signedIn();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await heading('Today')).toBeInTheDocument();
  });

  it.each([
    ['succeeds', () => new HttpResponse(null, { status: 204 })],
    ['fails', () => HttpResponse.error()],
  ])('logs out and clears every cached query when the request %s', async (_, respond) => {
    signedIn();
    let logouts = 0;
    server.use(
      http.post(`${API}/auth/logout`, () => {
        logouts += 1;
        return respond();
      }),
    );
    const user = userEvent.setup();
    const { router, client } = renderApp('/today');
    await heading('Today');
    client.setQueryData(queryKeys.cores.all, [{ id: 'core-1' }]);

    await user.click(screen.getByRole('button', { name: 'Account: Emin' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Log out' }));

    expect(await heading('Log in')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toBeNull();
    expect(logouts).toBe(1);
    expect(client.getQueryData(queryKeys.cores.all)).toBeUndefined();
    expect(client.getQueryData(queryKeys.me)).toBeNull();
  });

  it('ends the session when a request comes back 401, and says so', async () => {
    signedIn();
    server.use(http.get(`${API}/cores`, () => apiError(401, 'UNAUTHENTICATED', 'Not logged in')));
    const { router, client } = renderApp('/stats');
    await heading('Stats');
    client.setQueryData(queryKeys.cores.all, [{ id: 'core-1' }]);

    await act(() => api.get('/cores').catch(() => undefined));

    expect(await screen.findByText('Your session ended. Log in again.')).toBeInTheDocument();
    expect(await heading('Log in')).toBeInTheDocument();
    expect(router.state.location.state).toMatchObject({ from: { pathname: '/stats' } });
    expect(client.getQueryData(queryKeys.cores.all)).toBeUndefined();
  });
});
