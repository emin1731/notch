import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';
import { expect } from '@playwright/test';
import { uniqueUsername } from './users';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../../api');

/** The demo seed's password (apps/api/src/cli/demo-seed.ts). */
export const SEED_PASSWORD = 'demo-password';

/**
 * Seeds a user of its own with the demo history through last Sunday, last week not reviewed yet:
 * the first visit reviews it, on any day (its one change: Deep work eases off, 60 → 55 min).
 * Runs the seed CLI against the e2e database, outside the production-mode server.
 */
export function seedPendingReview(): { username: string; password: string } {
  const username = uniqueUsername('seed');
  execFileSync('node', ['dist/cli/seed.js', `--username=${username}`, '--pending-review'], {
    cwd: apiDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      LOG_LEVEL: 'silent',
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/notch_e2e',
      CSRF_SECRET: 'e2e-only-csrf-secret-0123456789abcdef',
      INVITE_CODE: 'e2e-invite-code',
    },
  });
  return { username, password: SEED_PASSWORD };
}

/** Logs `request` in (with `page.request`, the page is logged in too). */
export async function logInViaApi(
  request: APIRequestContext,
  { username, password }: { username: string; password: string },
) {
  await request.get('/api/v1/auth/csrf');
  const { cookies } = await request.storageState();
  const token = cookies.find((cookie) => cookie.name === 'XSRF-TOKEN')?.value ?? '';
  const response = await request.post('/api/v1/auth/login', {
    headers: { 'X-XSRF-TOKEN': token },
    data: { username, password },
  });
  expect(response.status(), await response.text()).toBe(200);
}
