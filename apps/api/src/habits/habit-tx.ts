import { type HabitHistory, type LocalDate, longestStreak } from '@notch/shared';
import { habitNotFound } from '../common/not-found.js';
import type { Habit, HabitLog, Prisma, TargetChange } from '../generated/prisma/client.js';
import { historyOf } from './habit-history.js';

// Steps shared by the writes to one habit (logs, edits), inside their transaction.

/**
 * 404 unless it's the user's habit; then holds its row lock until the transaction ends, so writes
 * to the same habit (and the weekly review, which locks all of the user's habits) run one by one.
 */
export async function lockOwnedHabit(
  tx: Prisma.TransactionClient,
  userId: string,
  habitId: string,
): Promise<Habit> {
  const rows = await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM "Habit" WHERE "id" = ${habitId} AND "userId" = ${userId} FOR UPDATE`;
  if (rows.length === 0) {
    throw habitNotFound();
  }
  return tx.habit.findUniqueOrThrow({ where: { id: habitId } });
}

/**
 * Recomputes the stored longest streak from the full history, after a write that can change which
 * days count: a log, or an edit to the schedule.
 */
export async function refreshLongestStreak(
  tx: Prisma.TransactionClient,
  habit: Habit,
  changes: readonly TargetChange[],
  today: LocalDate,
): Promise<{ history: HabitHistory; logs: HabitLog[]; longest: number }> {
  const logs = await tx.habitLog.findMany({ where: { habitId: habit.id } });
  const history = historyOf(habit, changes, logs);
  const longest = longestStreak(history, today);
  if (longest !== habit.longestStreak) {
    await tx.habit.update({ where: { id: habit.id }, data: { longestStreak: longest } });
  }
  return { history, logs, longest };
}
