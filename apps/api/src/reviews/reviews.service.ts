import { HttpStatus, Injectable } from '@nestjs/common';
import {
  addDays,
  decideForHabit,
  fromDateString,
  type LatestReviewDto,
  type ListReviewsQuery,
  type LocalDate,
  type ReviewDto,
  type ReviewListDto,
  startOfDayIn,
  todayIn,
  toDateString,
  UNDO_BLOCK_REASON_TEXT,
  undoBlockReason,
  type UndoResult,
  weekStartOf,
  type WeeklyReviewSummary,
} from '@notch/shared';
import type { AuthUser } from '../auth/request-auth.js';
import { Clock } from '../clock/clock.js';
import { AppException } from '../common/errors/app-exception.js';
import { reviewNotFound, targetChangeNotFound } from '../common/not-found.js';
import { isUniqueViolation } from '../common/prisma/is-unique-violation.js';
import type { Prisma, TargetChange, WeeklyReview } from '../generated/prisma/client.js';
import { toHabitDto, toTargetChangeDto } from '../habits/habit-dto.js';
import { historyOf } from '../habits/habit-history.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { currentValueOf, toReviewDto } from './review-dto.js';

const changesInclude = {
  changes: {
    include: {
      habit: { select: { name: true, targetValue: true, timesPerWeek: true, daysOfWeek: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.WeeklyReviewInclude;

/**
 * Weekly reviews (plan 2.7, 2.8, 6.6). Created lazily: `ensureDue` runs before anything that shows
 * or depends on this week's targets, which gives the same result as a job at Monday 00:00.
 */
@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Reviews the last completed week (in the user's timezone) unless that's already done. */
  async ensureDue(user: AuthUser): Promise<void> {
    const weekStart = addDays(weekStartOf(todayIn(user.timezone, this.clock.now())), -7);
    const existing = await this.prisma.weeklyReview.findUnique({
      where: { userId_weekStart: { userId: user.id, weekStart: fromDateString(weekStart) } },
      select: { id: true },
    });
    if (!existing) {
      await this.runForUser(user.id, weekStart);
    }
  }

  /**
   * Reviews the week starting `weekStart` (W) and applies its level-ups and deloads, in one
   * transaction. Returns null when no active habit existed for the whole week (nothing to judge).
   * Idempotent: a concurrent run loses on the unique (userId, weekStart) and reads the winner's.
   */
  async runForUser(userId: string, weekStart: LocalDate): Promise<WeeklyReview | null> {
    const startedBefore = await this.prisma.habit.count({
      where: { userId, archivedAt: null, startDate: { lte: fromDateString(weekStart) } },
    });
    if (startedBefore === 0) {
      return null;
    }
    try {
      return await this.prisma.$transaction((tx) => this.review(tx, userId, weekStart));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return this.prisma.weeklyReview.findUniqueOrThrow({
          where: { userId_weekStart: { userId, weekStart: fromDateString(weekStart) } },
        });
      }
      throw error;
    }
  }

  async list(userId: string, query: ListReviewsQuery): Promise<ReviewListDto> {
    const reviews = await this.prisma.weeklyReview.findMany({
      where: {
        userId,
        ...(query.cursor && { weekStart: { lt: fromDateString(query.cursor) } }),
      },
      include: changesInclude,
      orderBy: { weekStart: 'desc' },
      take: query.limit + 1,
    });
    const page = reviews.slice(0, query.limit);
    return {
      items: await this.toDtos(page),
      nextCursor: reviews.length > query.limit ? toDateString(page.at(-1)!.weekStart) : null,
    };
  }

  /** Runs `ensureDue` first, so a review appears on the first visit of the week. */
  async latest(user: AuthUser): Promise<LatestReviewDto> {
    await this.ensureDue(user);
    const review = await this.prisma.weeklyReview.findFirst({
      where: { userId: user.id },
      include: changesInclude,
      orderBy: { weekStart: 'desc' },
    });
    return { review: review ? (await this.toDtos([review]))[0]! : null };
  }

  async byWeek(userId: string, weekStart: LocalDate): Promise<ReviewDto> {
    const review = await this.prisma.weeklyReview.findUnique({
      where: { userId_weekStart: { userId, weekStart: fromDateString(weekStart) } },
      include: changesInclude,
    });
    if (!review) {
      throw reviewNotFound();
    }
    return (await this.toDtos([review]))[0]!;
  }

  /** Hides the Today banner (and "welcome back"). Keeps the first `seenAt`. */
  async markSeen(userId: string, id: string): Promise<ReviewDto> {
    const review = await this.prisma.weeklyReview.findFirst({ where: { id, userId } });
    if (!review) {
      throw reviewNotFound();
    }
    if (!review.seenAt) {
      await this.prisma.weeklyReview.update({ where: { id }, data: { seenAt: this.clock.now() } });
    }
    const updated = await this.prisma.weeklyReview.findUniqueOrThrow({
      where: { id },
      include: changesInclude,
    });
    return (await this.toDtos([updated]))[0]!;
  }

  /** Plan 6.5: restores the value before the change, if `undoBlockReason` allows it. */
  async undo(user: AuthUser, changeId: string): Promise<UndoResult> {
    const now = this.clock.now();
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.targetChange.findFirst({
        where: { id: changeId, habit: { userId: user.id } },
        select: { habitId: true },
      });
      if (!found) {
        throw targetChangeNotFound();
      }
      await tx.$queryRaw`SELECT 1 FROM "Habit" WHERE "id" = ${found.habitId} FOR UPDATE`;
      const change = await tx.targetChange.findUniqueOrThrow({ where: { id: changeId } });
      const habit = await tx.habit.findUniqueOrThrow({ where: { id: change.habitId } });
      const logsSince = await tx.habitLog.count({
        where: { habitId: habit.id, date: { gte: change.effectiveFrom } },
      });
      const reason = undoBlockReason(change, {
        now,
        hasLogSinceEffective: logsSince > 0,
        currentValue: currentValueOf(habit, change.field),
      });
      if (reason) {
        throw new AppException(
          'UNDO_NOT_ALLOWED',
          HttpStatus.CONFLICT,
          UNDO_BLOCK_REASON_TEXT[reason],
          { reason },
        );
      }
      const restored = await tx.habit.update({
        where: { id: habit.id },
        data:
          change.field === 'TIMES_PER_WEEK'
            ? { timesPerWeek: change.fromValue }
            : { targetValue: change.fromValue },
      });
      const undone = await tx.targetChange.update({
        where: { id: change.id },
        data: { undoneAt: now },
      });
      return { change: toTargetChangeDto(undone), habit: toHabitDto(restored) };
    });
  }

  private async review(
    tx: Prisma.TransactionClient,
    userId: string,
    weekStart: LocalDate,
  ): Promise<WeeklyReview> {
    const weekEnd = addDays(weekStart, 6);
    // Serialises with log writes and habit edits, which lock their habit row.
    await tx.$queryRaw`SELECT 1 FROM "Habit" WHERE "userId" = ${userId} FOR UPDATE`;
    // Claims the week first: a concurrent run fails here (unique) and reads this one instead.
    const review = await tx.weeklyReview.create({
      data: { userId, weekStart: fromDateString(weekStart), summary: {} },
    });
    const { timezone } = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    const habits = await tx.habit.findMany({
      where: { userId, archivedAt: null, startDate: { lte: fromDateString(weekEnd) } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const habitIds = habits.map((habit) => habit.id);
    const [logs, changes] = await Promise.all([
      tx.habitLog.findMany({
        where: {
          habitId: { in: habitIds },
          date: { gte: fromDateString(addDays(weekStart, -7)), lte: fromDateString(weekEnd) },
        },
      }),
      tx.targetChange.findMany({ where: { habitId: { in: habitIds } } }),
    ]);
    // Plan 2.7: no logs at all in W is a break, not a struggle. Nobody gets deloaded for it.
    const inactiveWeek = !logs.some((log) => toDateString(log.date) >= weekStart);

    const effectiveFrom = addDays(weekStart, 7);
    const summary: WeeklyReviewSummary = { weekStart, overallRate: null, habits: [] };
    for (const habit of habits) {
      const result = decideForHabit({
        habit,
        history: historyOf(
          habit,
          changes.filter((change) => change.habitId === habit.id),
          logs.filter((log) => log.habitId === habit.id),
        ),
        weekStart,
        inactiveWeek,
      });
      let targetChangeId: string | undefined;
      if (result.decision !== 'HOLD' && result.field && result.toValue !== undefined) {
        await tx.habit.update({
          where: { id: habit.id },
          data:
            result.field === 'TIMES_PER_WEEK'
              ? { timesPerWeek: result.toValue }
              : { targetValue: result.toValue },
        });
        const change = await tx.targetChange.create({
          data: {
            habitId: habit.id,
            weeklyReviewId: review.id,
            kind: result.decision,
            field: result.field,
            fromValue: result.fromValue!,
            toValue: result.toValue,
            effectiveFrom: fromDateString(effectiveFrom),
            // The end of the week the change applies to, at local midnight.
            undoDeadline: startOfDayIn(timezone, addDays(effectiveFrom, 7)),
            reason: {
              rule: result.reason,
              rates: { current: result.rate, previous: result.previousRate },
            },
          },
        });
        targetChangeId = change.id;
      }
      summary.habits.push({
        habitId: habit.id,
        name: habit.name,
        coreId: habit.coreId,
        rate: result.rate,
        previousRate: result.previousRate,
        decision: result.decision,
        reason: result.reason,
        ...(targetChangeId && { targetChangeId }),
      });
    }
    const rates = summary.habits.flatMap((habit) => (habit.rate === null ? [] : [habit.rate]));
    summary.overallRate =
      rates.length === 0 ? null : rates.reduce((sum, rate) => sum + rate, 0) / rates.length;

    return tx.weeklyReview.update({
      where: { id: review.id },
      data: { inactive: inactiveWeek, summary: summary as unknown as Prisma.InputJsonValue },
    });
  }

  /** `canUndo` needs, per change, whether its habit has been logged since it took effect. */
  private async toDtos(
    reviews: (WeeklyReview & Prisma.WeeklyReviewGetPayload<{ include: typeof changesInclude }>)[],
  ): Promise<ReviewDto[]> {
    const changes = reviews.flatMap((review) => review.changes);
    const logs =
      changes.length === 0
        ? []
        : await this.prisma.habitLog.findMany({
            where: {
              habitId: { in: changes.map((change) => change.habitId) },
              date: {
                gte: new Date(Math.min(...changes.map((change) => change.effectiveFrom.getTime()))),
              },
            },
            select: { habitId: true, date: true },
          });
    const hasLogSince = (change: TargetChange) =>
      logs.some(
        (log) =>
          log.habitId === change.habitId && log.date.getTime() >= change.effectiveFrom.getTime(),
      );
    const now = this.clock.now();
    return reviews.map((review) => toReviewDto(review, { now, hasLogSince }));
  }
}
