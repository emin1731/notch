// Playwright's web server: a fresh e2e database, then the built API serving the built web app on
// one origin, under the production CSP. Run by playwright.config.ts; needs `pnpm build` first.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, '../../api');
const webDist = resolve(here, '../dist');

for (const built of [resolve(apiDir, 'dist/main.js'), resolve(webDist, 'index.html')]) {
  if (!existsSync(built)) {
    throw new Error(`${built} is missing. Build first: pnpm turbo run build`);
  }
}

const databaseUrl = new URL(
  process.env.E2E_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5434/notch_e2e',
);
const database = databaseUrl.pathname.slice(1);
if (!/^notch_e2e\w*$/.test(database)) {
  // This database is dropped on every run.
  throw new Error(
    `Refusing to reset "${database}": the e2e database name must start with notch_e2e`,
  );
}

const adminUrl = new URL(databaseUrl);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.href });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
await admin.query(`CREATE DATABASE "${database}"`);
await admin.end();

execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  cwd: apiDir,
  env: { ...process.env, DATABASE_URL: databaseUrl.href },
  stdio: 'inherit',
});

const api = spawn('node', ['dist/main.js'], {
  cwd: apiDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: process.env.E2E_PORT ?? '3100',
    DATABASE_URL: databaseUrl.href,
    WEB_DIST_DIR: webDist,
    LOG_LEVEL: 'warn',
    TRUST_PROXY: 'false',
    // Plain HTTP on localhost.
    COOKIE_SECURE: 'false',
    CSRF_SECRET: 'e2e-only-csrf-secret-0123456789abcdef',
    INVITE_CODE: process.env.E2E_INVITE_CODE ?? 'e2e-invite-code',
    // Every spec registers its own users.
    MAX_USERS: '10000',
    AUTH_THROTTLE_LIMIT: '10000',
  },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => api.kill(signal));
}
api.on('exit', (code) => process.exit(code ?? 0));
