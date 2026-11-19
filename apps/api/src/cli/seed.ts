/**
 * Creates (or recreates) the demo user with 8 weeks of history. Development only.
 *
 *   pnpm --filter @notch/api seed [--timezone=Europe/Berlin] [--username=demo] [--pending-review]
 *
 * `--pending-review` stops the history at the end of last week, before its review: the next visit
 * reviews last week, as on a Monday morning, on any day.
 */
import { timezoneSchema, todayIn, usernameSchema } from '@notch/shared';
import { parseArgs } from 'node:util';
import { PasswordService } from '../auth/password.service.js';
import { DEMO_PASSWORD, DEMO_USERNAME, seedDemo } from './demo-seed.js';
import { CliError, runCli } from './run-cli.js';

await runCli(async (app) => {
  if (process.env.NODE_ENV === 'production') {
    throw new CliError('The demo seed never runs in production');
  }
  const { values } = parseArgs({
    options: {
      timezone: { type: 'string', default: 'UTC' },
      username: { type: 'string', default: DEMO_USERNAME },
      'pending-review': { type: 'boolean', default: false },
    },
  });
  const timezone = timezoneSchema.parse(values.timezone);
  const username = usernameSchema.parse(values.username);
  const today = todayIn(timezone, new Date());

  const passwordHash = await app.get(PasswordService).hash(DEMO_PASSWORD);
  const { habitIds } = await seedDemo(app, {
    username,
    today,
    timezone,
    passwordHash,
    pendingMonday: values['pending-review'],
  });
  console.log(
    `Seeded "${username}" / "${DEMO_PASSWORD}" (${timezone}) with ${Object.keys(habitIds).length} habits and 8 weeks of logs${values['pending-review'] ? ', last week not reviewed yet' : ''}.`,
  );
});
