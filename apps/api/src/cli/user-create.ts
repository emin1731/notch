/**
 * Creates a user without an invite code or the MAX_USERS check.
 *
 *   pnpm --filter @notch/api user:create <username> [--timezone=Asia/Baku] [--name="Emin"]
 */
import { nameSchema, timezoneSchema, usernameSchema } from '@notch/shared';
import { parseArgs } from 'node:util';
import { AuthService } from '../auth/auth.service.js';
import { CliError, promptNewPassword, runCli } from './run-cli.js';

await runCli(async (app) => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { timezone: { type: 'string', default: 'UTC' }, name: { type: 'string' } },
  });
  if (positionals.length !== 1) {
    throw new CliError('Usage: user:create <username> [--timezone=Area/City] [--name=Name]');
  }
  const username = usernameSchema.parse(positionals[0]);
  const timezone = timezoneSchema.parse(values.timezone);
  const name = values.name === undefined ? null : nameSchema.parse(values.name);
  const password = await promptNewPassword();

  const user = await app.get(AuthService).createUser({ username, password, name, timezone });
  console.log(`Created user "${user.username}" (${user.timezone}).`);
});
