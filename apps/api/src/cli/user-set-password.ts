/**
 * Sets a new password and logs the user out everywhere. The way to recover an account: there is
 * no email.
 *
 *   pnpm --filter @notch/api user:set-password <username>
 */
import { usernameSchema } from '@notch/shared';
import { parseArgs } from 'node:util';
import { AuthService } from '../auth/auth.service.js';
import { CliError, promptNewPassword, runCli } from './run-cli.js';

await runCli(async (app) => {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length !== 1) {
    throw new CliError('Usage: user:set-password <username>');
  }
  const username = usernameSchema.parse(positionals[0]);
  const password = await promptNewPassword();

  await app.get(AuthService).setPassword(username, password);
  console.log(`Password updated for "${username}". All of their sessions were ended.`);
});
