import { type APIRequestContext, expect } from '@playwright/test';

/** The invite code the e2e API runs with (see start-server.mjs). */
export const E2E_INVITE_CODE = 'e2e-invite-code';

export const E2E_PASSWORD = 'correct horse battery';

/** A username no other spec or run uses. */
export function uniqueUsername(prefix = 'e2e'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The request's current CSRF token (it changes when a session starts). */
async function csrfToken(request: APIRequestContext): Promise<string> {
  const { cookies } = await request.storageState();
  return cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
}

/**
 * Registers a user through the API, the way the app does (CSRF cookie, then the header). With
 * `page.request` the page is logged in as that user afterwards. Onboarding is marked done unless
 * `onboarded: false`, so specs about other pages aren't sent to it.
 */
export async function registerViaApi(
  request: APIRequestContext,
  { username = uniqueUsername(), name = 'E2E', timezone = 'UTC', onboarded = true } = {},
) {
  await request.get('/api/v1/auth/csrf');
  const response = await request.post('/api/v1/auth/register', {
    headers: { 'X-XSRF-TOKEN': await csrfToken(request) },
    data: { username, password: E2E_PASSWORD, inviteCode: E2E_INVITE_CODE, name, timezone },
  });
  expect(response.status(), await response.text()).toBe(201);
  if (onboarded) {
    const done = await request.post('/api/v1/me/onboarding/complete', {
      headers: { 'X-XSRF-TOKEN': await csrfToken(request) },
    });
    expect(done.status(), await done.text()).toBe(200);
  }
  return { username, password: E2E_PASSWORD };
}
