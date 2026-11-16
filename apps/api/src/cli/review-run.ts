/**
 * Runs the weekly review of one week for one user, as ensureDue would. Development only: for
 * trying out decisions without waiting for a Monday. Idempotent like the real thing.
 *
 *   pnpm --filter @notch/api review:run <username> --week=2026-11-09
 */
import {
  localDateSchema,
  usernameSchema,
  weekStartOf,
  type WeeklyReviewSummary,
} from '@notch/shared';
import { parseArgs } from 'node:util';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { CliError, runCli } from './run-cli.js';

await runCli(async (app) => {
  if (process.env.NODE_ENV === 'production') {
    throw new CliError('review:run never runs in production');
  }
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { week: { type: 'string' } },
  });
  if (positionals.length !== 1 || !values.week) {
    throw new CliError('Usage: review:run <username> --week=YYYY-MM-DD');
  }
  const username = usernameSchema.parse(positionals[0]);
  const weekStart = weekStartOf(localDateSchema.parse(values.week));

  const user = await app.get(PrismaService).user.findUnique({ where: { username } });
  if (!user) {
    throw new CliError(`No user named "${username}"`);
  }
  const review = await app.get(ReviewsService).runForUser(user.id, weekStart);
  if (!review) {
    console.log(`No review for the week of ${weekStart}: no habit existed for the whole week.`);
    return;
  }
  const summary = review.summary as unknown as WeeklyReviewSummary;
  console.log(`Review of the week of ${weekStart}${review.inactive ? ' (inactive)' : ''}:`);
  for (const habit of summary.habits) {
    const rate = habit.rate === null ? '—' : `${Math.round(habit.rate * 100)}%`;
    console.log(
      `  ${habit.name.padEnd(20)} ${rate.padStart(4)}  ${habit.decision} / ${habit.reason}`,
    );
  }
});
