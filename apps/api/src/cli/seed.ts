/**
 * Creates (or recreates) the demo user with 8 weeks of history. Development only.
 *
 *   pnpm --filter @notch/api seed [--timezone=Europe/Berlin]
 */
import { timezoneSchema, todayIn } from '@notch/shared';
import { parseArgs } from 'node:util';
import { PasswordService } from '../auth/password.service.js';
import { DEMO_PASSWORD, DEMO_USERNAME, seedDemo } from './demo-seed.js';
import { CliError, runCli } from './run-cli.js';

await runCli(async (app) => {
  if (process.env.NODE_ENV === 'production') {
    throw new CliError('The demo seed never runs in production');
  }
  const { values } = parseArgs({ options: { timezone: { type: 'string', default: 'UTC' } } });
  const timezone = timezoneSchema.parse(values.timezone);
  const today = todayIn(timezone, new Date());

  const passwordHash = await app.get(PasswordService).hash(DEMO_PASSWORD);
  const { habitIds } = await seedDemo(app, { today, timezone, passwordHash });
  console.log(
    `Seeded "${DEMO_USERNAME}" / "${DEMO_PASSWORD}" (${timezone}) with ${Object.keys(habitIds).length} habits and 8 weeks of logs.`,
  );
});
