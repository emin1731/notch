import { defineConfig, devices } from '@playwright/test';
import { E2E_INVITE_CODE } from './e2e/support/users';

const PORT = 3100;
const CI = Boolean(process.env.CI);

/**
 * Golden paths against the real API and database (docs/web-sprints.md). The built API serves the
 * built web app, as in production. Needs the compose Postgres and a build first.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      // PW_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's download.
      use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL || undefined },
    },
  ],
  webServer: {
    command: 'node e2e/start-server.mjs',
    url: `http://localhost:${PORT}/api/v1/health`,
    // Always a fresh database: never reuse a server from another run.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    env: { E2E_PORT: String(PORT), E2E_INVITE_CODE },
  },
});
