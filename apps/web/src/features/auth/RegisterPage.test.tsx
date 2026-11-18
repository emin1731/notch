import type { ErrorCode } from '@notch/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API, apiError, signedOut, testUser } from '@/test/auth';
import { renderApp } from '@/test/render';
import { server } from '@/test/server';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

async function fillIn(user: ReturnType<typeof userEvent.setup>, { name = '' } = {}) {
  await user.type(screen.getByLabelText('Username'), 'Emin');
  await user.type(screen.getByLabelText('Password'), 'correct horse');
  if (name) {
    await user.type(screen.getByLabelText('Name (optional)'), name);
  }
  await user.type(screen.getByLabelText('Invite code'), 'let-me-in');
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('register page', () => {
  beforeEach(() => {
    signedOut();
    const options = Intl.DateTimeFormat().resolvedOptions();
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...options,
      timeZone: 'Asia/Baku',
    });
  });

  it('registers with the detected timezone and logs straight in', async () => {
    let body: unknown;
    server.use(
      http.post(`${API}/auth/register`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(testUser, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/register');

    await heading('Create your account');
    expect(screen.getByText(/Timezone: Asia\/Baku, from this device/)).toBeInTheDocument();
    await fillIn(user);

    expect(await heading('Today')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/today');
    // An empty name is left out rather than sent as "".
    expect(body).toEqual({
      username: 'emin',
      password: 'correct horse',
      inviteCode: 'let-me-in',
      timezone: 'Asia/Baku',
    });
  });

  it('keeps the page you asked for when you switch from login to register', async () => {
    server.use(
      http.post(`${API}/auth/register`, () => HttpResponse.json(testUser, { status: 201 })),
    );
    const user = userEvent.setup();
    const { router } = renderApp('/cores');

    await heading('Log in');
    await user.click(screen.getByRole('link', { name: 'Register with an invite code' }));
    await heading('Create your account');
    await fillIn(user, { name: 'Emin' });

    expect(await heading('Cores & Goals')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cores');
  });

  it('shows the shared schema messages before sending anything', async () => {
    const user = userEvent.setup();
    renderApp('/register');

    await heading('Create your account');
    await user.type(screen.getByLabelText('Username'), 'a b');
    await user.type(screen.getByLabelText('Password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('3–50 characters: letters, digits, dot, dash or underscore'),
    ).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();
    expect(screen.getByText('Enter your invite code')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toHaveFocus();
  });

  it.each([
    ['USERNAME_TAKEN', 409, 'Username', 'That username is taken. Try another one.'],
    [
      'INVALID_INVITE_CODE',
      403,
      'Invite code',
      "That invite code doesn't work. Check it and try again.",
    ],
  ] as const)('puts %s on its field', async (code: ErrorCode, status, label, message) => {
    server.use(http.post(`${API}/auth/register`, () => apiError(status, code)));
    const user = userEvent.setup();
    renderApp('/register');

    await heading('Create your account');
    await fillIn(user);

    expect(await screen.findByText(message)).toBeInTheDocument();
    const input = screen.getByLabelText(label);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(expect.stringContaining(message));
    expect(input).toHaveFocus();
  });

  it('puts server validation issues on their fields', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        apiError(400, 'VALIDATION_FAILED', 'Request validation failed', {
          issues: [{ path: 'password', code: 'too_small', message: 'Use at least 8 characters' }],
        }),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');

    await heading('Create your account');
    await fillIn(user);

    expect(await screen.findByText('Use at least 8 characters')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('says when registration is closed', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        apiError(403, 'REGISTRATION_CLOSED', 'Registration is closed'),
      ),
    );
    const user = userEvent.setup();
    renderApp('/register');

    await heading('Create your account');
    await fillIn(user);

    expect(await screen.findByRole('alert')).toHaveTextContent('Registration is closed for now.');
  });
});
