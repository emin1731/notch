import { type APIRequestContext, expect } from '@playwright/test';

/** The invite code the e2e API runs with (see start-server.mjs). */
export const E2E_INVITE_CODE = 'e2e-invite-code';

export const E2E_PASSWORD = 'correct horse battery';

/** A username no other spec or run uses. */
export function uniqueUsername(prefix = 'e2e'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Registers a user through the API, the way the app does (CSRF cookie, then the header). With
 * `page.request` the page is logged in as that user afterwards.
 */
export async function registerViaApi(
  request: APIRequestContext,
  { username = uniqueUsername(), name = 'E2E', timezone = 'UTC' } = {},
) {
  await request.get('/api/v1/auth/csrf');
  const { cookies } = await request.storageState();
  const token = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  const response = await request.post('/api/v1/auth/register', {
    headers: { 'X-XSRF-TOKEN': token },
    data: { username, password: E2E_PASSWORD, inviteCode: E2E_INVITE_CODE, name, timezone },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { username, password: E2E_PASSWORD };
}
