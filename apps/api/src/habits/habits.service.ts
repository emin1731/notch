import { Injectable } from '@nestjs/common';
import {
  adaptiveApplicable,
  addDays,
  type CreateHabitInput,
  currentStreak,
  daysToMask,
  defaultMinTarget,
  fromDateString,
  type HabitDetailDto,
  type HabitDto,
  habitShapeIssues,
  type ListHabitsQuery,
  type LocalDate,
  PROGRESSION_CONFIG,
  progressingField,
  type TargetChangeDto,
  type TargetField,
  todayIn,
  toDateString,
  type UpdateHabitInput,
} from '@notch/shared';
import type { AuthUser } from '../auth/request-auth.js';
import { Clock } from '../clock/clock.js';
import { coreArchived, validationFailed } from '../common/errors/conflicts.js';
import { habitNotFound } from '../common/not-found.js';
import { applyOrder } from '../common/ordering.js';
import { CoresService } from '../cores/cores.service.js';
import type { Habit, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { toHabitDto, toTargetChangeDto } from './habit-dto.js';
import { historyOf } from './habit-history.js';
import { lockOwnedHabit, refreshLongestStreak } from './habit-tx.js';

type Db = PrismaService | Prisma.TransactionClient;

const ORDER = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
] as const satisfies Prisma.HabitOrderByWithRelationInput[];

/** How far ahead a start date may be. Backwards, it's the backfill window (6 days). */
const MAX_START_DAYS_AHEAD = 365;

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cores: CoresService,
    private readonly clock: Clock,
    private readonly reviews: ReviewsService,
  ) {}

  async list(userId: string, query: ListHabitsQuery): Promise<HabitDto[]> {
    const habits = await this.prisma.habit.findMany({
      where: {
        userId,
        ...(query.coreId && { coreId: query.coreId }),
        ...(!query.includeArchived && { archivedAt: null }),
      },
      orderBy: ORDER,
    });
    return habits.map(toHabitDto);
  }

  async detail(user: AuthUser, id: string): Promise<HabitDetailDto> {
    await this.findOwned(user.id, id);
    return this.detailOf(id, user.timezone);
  }

  async create(user: AuthUser, input: CreateHabitInput): Promise<HabitDetailDto> {
    const today = todayIn(user.timezone, this.clock.now());
    const startDate = input.startDate ?? today;
    if (
      startDate < addDays(today, -PROGRESSION_CONFIG.backfillDays) ||
      startDate > addDays(today, MAX_START_DAYS_AHEAD)
    ) {
      throw validationFailed([
        {
          path: 'startDate',
          message: `Between ${PROGRESSION_CONFIG.backfillDays} days ago and a year from now`,
        },
      ]);
    }

    const habit = await this.prisma.$transaction(async (tx) => {
      await this.assertCore(tx, user.id, input.coreId);
      const { coreId: _coreId, startDate: _startDate, ...fields } = input;
      const { _max } = await tx.habit.aggregate({
        where: { userId: user.id },
        _max: { sortOrder: true },
      });
      return tx.habit.create({
        data: {
          ...fields,
          userId: user.id,
          coreId: input.coreId,
          minTarget: input.minTarget ?? defaultMinTargetFor(input),
          initialTargetValue: input.targetValue,
          initialTimesPerWeek: input.timesPerWeek,
          startDate: fromDateString(startDate),
          sortOrder: (_max.sortOrder ?? -1) + 1,
        },
      });
    });
    return this.detailOf(habit.id, user.timezone);
  }

  /**
   * `type`, `scheduleType` and `startDate` never change. A new target, weekly quota, set of
   * weekdays or interval is recorded as a MANUAL TargetChange effective from the local today.
   */
  async update(user: AuthUser, id: string, input: UpdateHabitInput): Promise<HabitDetailDto> {
    // Last week's review decides on last week's values, so it runs before they can change.
    await this.reviews.ensureDue(user);
    const today = todayIn(user.timezone, this.clock.now());
    await this.prisma.$transaction(async (tx) => {
      const habit = await lockOwnedHabit(tx, user.id, id);
      const merged = { ...habit, ...definedFields(input) };
      const issues = habitShapeIssues(merged);
      if (issues.length > 0) {
        throw validationFailed(issues);
      }
      if (input.coreId !== undefined && input.coreId !== habit.coreId) {
        await this.assertCore(tx, user.id, input.coreId);
      }

      const changes: [TargetField, number, number][] = [
        ['TARGET_VALUE', habit.targetValue, merged.targetValue],
        ['TIMES_PER_WEEK', habit.timesPerWeek ?? 0, merged.timesPerWeek ?? 0],
        ['DAYS_OF_WEEK', daysToMask(habit.daysOfWeek), daysToMask(merged.daysOfWeek)],
        ['INTERVAL_DAYS', habit.intervalDays ?? 0, merged.intervalDays ?? 0],
      ];
      let scheduleChanged = false;
      for (const [field, from, to] of changes) {
        if (from !== to) {
          await this.recordManualChange(tx, id, field, from, to, today);
          scheduleChanged ||= field !== 'TARGET_VALUE';
        }
      }
      const updated = await tx.habit.update({ where: { id }, data: definedFields(input) });
      // Other days are due now, so a streak can be longer than the stored longest.
      if (scheduleChanged) {
        const allChanges = await tx.targetChange.findMany({ where: { habitId: id } });
        await refreshLongestStreak(tx, updated, allChanges, today);
      }
    });
    return this.detailOf(id, user.timezone);
  }

  /** The listed habits first, the others after them in their current order. */
  async reorder(userId: string, ids: string[]): Promise<HabitDto[]> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.habit.findMany({
        where: { userId },
        select: { id: true, sortOrder: true },
        orderBy: ORDER,
      });
      const ordered = applyOrder(
        current.map((habit) => habit.id),
        ids,
      );
      if (!ordered) {
        throw habitNotFound();
      }
      const sortOrderById = new Map(current.map((habit) => [habit.id, habit.sortOrder]));
      for (const [sortOrder, habitId] of ordered.entries()) {
        if (sortOrderById.get(habitId) !== sortOrder) {
          await tx.habit.update({ where: { id: habitId }, data: { sortOrder } });
        }
      }
    });
    return this.list(userId, { includeArchived: false });
  }

  async archive(user: AuthUser, id: string): Promise<HabitDetailDto> {
    const habit = await this.findOwned(user.id, id);
    if (!habit.archivedAt) {
      await this.prisma.habit.update({ where: { id }, data: { archivedAt: this.clock.now() } });
    }
    return this.detailOf(id, user.timezone);
  }

  async unarchive(user: AuthUser, id: string): Promise<HabitDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const habit = await this.findOwned(user.id, id, tx);
      // With the core locked, archiving it waits for this, or this sees it archived.
      const core = await this.cores.lockOwned(tx, user.id, habit.coreId);
      if (core.archivedAt) {
        throw coreArchived();
      }
      await tx.habit.update({ where: { id }, data: { archivedAt: null } });
    });
    return this.detailOf(id, user.timezone);
  }

  /** Permanently deletes the habit, its logs and its target changes. */
  async delete(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.habit.deleteMany({ where: { id, userId } });
    if (count === 0) {
      throw habitNotFound();
    }
  }

  /** Every change, oldest first, for the target-history chart. */
  async targetHistory(userId: string, id: string): Promise<TargetChangeDto[]> {
    await this.findOwned(userId, id);
    const changes = await this.prisma.targetChange.findMany({
      where: { habitId: id },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    });
    return changes.map(toTargetChangeDto);
  }

  async findOwned(userId: string, id: string, db: Db = this.prisma): Promise<Habit> {
    const habit = await db.habit.findFirst({ where: { id, userId } });
    if (!habit) {
      throw habitNotFound();
    }
    return habit;
  }

  /** With the current streak as of the local today, which needs the full log history. */
  private async detailOf(id: string, timezone: string): Promise<HabitDetailDto> {
    const habit = await this.prisma.habit.findUniqueOrThrow({
      where: { id },
      include: {
        targetChanges: { orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }] },
        logs: true,
      },
    });
    const today = todayIn(timezone, this.clock.now());
    return {
      ...toHabitDto(habit),
      currentStreak: currentStreak(historyOf(habit, habit.targetChanges, habit.logs), today),
      recentChanges: habit.targetChanges.slice(0, 10).map(toTargetChangeDto),
    };
  }

  /** A new or changed core must be the user's and active. */
  private async assertCore(db: Db, userId: string, coreId: string): Promise<void> {
    const core = await this.cores.findOwned(userId, coreId, db);
    if (core.archivedAt) {
      throw coreArchived();
    }
  }

  /**
   * Two edits on the same day make one change: the latest change of the field, if it's today's
   * manual one, is updated (or removed when the value is back where it started).
   */
  private async recordManualChange(
    tx: Prisma.TransactionClient,
    habitId: string,
    field: TargetField,
    fromValue: number,
    toValue: number,
    today: LocalDate,
  ): Promise<void> {
    const latest = await tx.targetChange.findFirst({
      where: { habitId, field, undoneAt: null },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    if (latest?.kind === 'MANUAL' && toDateString(latest.effectiveFrom) === today) {
      if (latest.fromValue === toValue) {
        await tx.targetChange.delete({ where: { id: latest.id } });
      } else {
        await tx.targetChange.update({ where: { id: latest.id }, data: { toValue } });
      }
      return;
    }
    await tx.targetChange.create({
      data: {
        habitId,
        kind: 'MANUAL',
        field,
        fromValue,
        toValue,
        effectiveFrom: fromDateString(today),
      },
    });
  }
}

/** Default floor for adaptive habits: half the initial value of the progressing field. */
function defaultMinTargetFor(input: CreateHabitInput): number | null {
  const field = progressingField(input);
  if (!adaptiveApplicable(input) || field === null) {
    return null;
  }
  const initial = field === 'TIMES_PER_WEEK' ? input.timesPerWeek! : input.targetValue;
  return defaultMinTarget(input, initial);
}

/** Drops keys the client didn't send, so they don't overwrite anything. */
function definedFields<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
