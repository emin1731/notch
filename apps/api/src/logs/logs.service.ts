import { HttpStatus, Injectable } from '@nestjs/common';
import {
  addDays,
  computeProgress,
  currentStreak,
  fromDateString,
  type LocalDate,
  type LogDto,
  type LogRangeQuery,
  type LogWriteResult,
  longestStreak,
  maxLogValue,
  PROGRESSION_CONFIG,
  targetOn,
  todayIn,
  toDateString,
} from '@notch/shared';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/request-auth.js';
import { Clock } from '../clock/clock.js';
import { AppException } from '../common/errors/app-exception.js';
import { validationFailed } from '../common/errors/conflicts.js';
import { habitNotFound } from '../common/not-found.js';
import type { Habit, HabitLog, Prisma, TargetChange } from '../generated/prisma/client.js';
import { historyOf, toChangeLite } from '../habits/habit-history.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;
type Mutation = (tx: Tx, habit: Habit, changes: TargetChange[]) => Promise<void>;

const toLogDto = (log: HabitLog): LogDto => ({
  date: toDateString(log.date),
  value: log.value,
  targetSnapshot: log.targetSnapshot,
});

/**
 * Logs for today and the 6 days before (plan 2.4). Every write locks the habit row, applies the
 * change, deletes the log if its value is now 0, and recomputes the stored longest streak, all in
 * one transaction.
 */
@Injectable()
export class LogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Defaults to the 30 days up to the local today. */
  async list(user: AuthUser, habitId: string, query: LogRangeQuery): Promise<LogDto[]> {
    const habit = await this.prisma.habit.findFirst({ where: { id: habitId, userId: user.id } });
    if (!habit) {
      throw habitNotFound();
    }
    const to = query.to ?? todayIn(user.timezone, this.clock.now());
    const from = query.from ?? addDays(to, -29);
    const logs = await this.prisma.habitLog.findMany({
      where: { habitId, date: { gte: fromDateString(from), lte: fromDateString(to) } },
      orderBy: { date: 'asc' },
    });
    return logs.map(toLogDto);
  }

  /** Sets the day's value. 0 deletes the log. */
  set(user: AuthUser, habitId: string, date: LocalDate, value: number): Promise<LogWriteResult> {
    return this.write(user, habitId, date, async (tx, habit, changes) => {
      assertWithinCap(habit, value);
      if (value === 0) {
        await tx.habitLog.deleteMany({ where: { habitId, date: fromDateString(date) } });
        return;
      }
      await tx.habitLog.upsert({
        where: { habitId_date: { habitId, date: fromDateString(date) } },
        create: {
          habitId,
          userId: user.id,
          date: fromDateString(date),
          value,
          targetSnapshot: snapshotFor(habit, changes, date),
        },
        update: { value },
      });
    });
  }

  /** Adds `delta` atomically, clamped to 0 … the type's cap. Used by counters and the timer. */
  increment(
    user: AuthUser,
    habitId: string,
    date: LocalDate,
    delta: number,
  ): Promise<LogWriteResult> {
    return this.write(user, habitId, date, async (tx, habit, changes) => {
      const cap = maxLogValue(habit.type);
      const snapshot = snapshotFor(habit, changes, date);
      await tx.$executeRaw`
        INSERT INTO "HabitLog" ("id", "habitId", "userId", "date", "value", "targetSnapshot", "updatedAt")
        VALUES (${randomUUID()}, ${habitId}, ${user.id}, CAST(${date} AS date),
                LEAST(GREATEST(${delta}::int, 0), ${cap}::int), ${snapshot}::int, now())
        ON CONFLICT ("habitId", "date") DO UPDATE
        SET "value" = LEAST(GREATEST("HabitLog"."value" + ${delta}::int, 0), ${cap}::int),
            "updatedAt" = now()`;
      await tx.habitLog.deleteMany({ where: { habitId, date: fromDateString(date), value: 0 } });
    });
  }

  /** Idempotent: deleting a log that isn't there is fine. */
  remove(user: AuthUser, habitId: string, date: LocalDate): Promise<LogWriteResult> {
    return this.write(user, habitId, date, async (tx) => {
      await tx.habitLog.deleteMany({ where: { habitId, date: fromDateString(date) } });
    });
  }

  private write(
    user: AuthUser,
    habitId: string,
    date: LocalDate,
    mutate: Mutation,
  ): Promise<LogWriteResult> {
    const today = todayIn(user.timezone, this.clock.now());
    return this.prisma.$transaction(async (tx) => {
      const habit = await this.lockHabit(tx, user.id, habitId);
      if (habit.archivedAt) {
        throw new AppException(
          'HABIT_ARCHIVED',
          HttpStatus.CONFLICT,
          'Unarchive the habit to log it',
        );
      }
      assertInWindow(habit, date, today);
      // S5: WeeklyReviewService.ensureDue(user) runs here, before the first log of a new week.

      const changes = await tx.targetChange.findMany({ where: { habitId } });
      await mutate(tx, habit, changes);

      const logs = await tx.habitLog.findMany({ where: { habitId } });
      const history = historyOf(habit, changes, logs);
      const longest = longestStreak(history, today);
      if (longest !== habit.longestStreak) {
        await tx.habit.update({ where: { id: habitId }, data: { longestStreak: longest } });
      }
      const log = logs.find((row) => toDateString(row.date) === date);
      return {
        log: log ? toLogDto(log) : null,
        habitProgress: log ? computeProgress(log.value, log.targetSnapshot) : 0,
        currentStreak: currentStreak(history, today),
        longestStreak: longest,
      };
    });
  }

  /** 404 unless it's the user's habit; then holds its row lock until the transaction ends. */
  private async lockHabit(tx: Tx, userId: string, habitId: string): Promise<Habit> {
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM "Habit" WHERE "id" = ${habitId} AND "userId" = ${userId} FOR UPDATE`;
    if (rows.length === 0) {
      throw habitNotFound();
    }
    return tx.habit.findUniqueOrThrow({ where: { id: habitId } });
  }
}

/** The target in effect on the log's date: backfilling across a change uses the old target. */
function snapshotFor(habit: Habit, changes: TargetChange[], date: LocalDate): number {
  return targetOn(date, habit.targetValue, changes.map(toChangeLite));
}

function assertWithinCap(habit: Habit, value: number): void {
  const cap = maxLogValue(habit.type);
  if (value > cap) {
    throw validationFailed([{ path: 'value', message: `At most ${cap} for this habit` }]);
  }
}

/** Today and the 6 days before, never before the habit's start date. */
export function assertInWindow(habit: Habit | null, date: LocalDate, today: LocalDate): void {
  const startDate = habit ? toDateString(habit.startDate) : null;
  const earliest = addDays(today, -PROGRESSION_CONFIG.backfillDays);
  const from = startDate && startDate > earliest ? startDate : earliest;
  if (date < from || date > today) {
    throw new AppException(
      'BACKFILL_OUT_OF_RANGE',
      HttpStatus.BAD_REQUEST,
      `Only ${from} to ${today} can be logged`,
      { earliest: from, latest: today },
    );
  }
}
