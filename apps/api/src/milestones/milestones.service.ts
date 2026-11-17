import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type GoalChangeResult,
  LIMITS,
  type MilestoneChangeResult,
  type MilestoneDto,
  nextGoalStatus,
} from '@notch/shared';
import { Clock } from '../clock/clock.js';
import { AppException } from '../common/errors/app-exception.js';
import { goalNotFound, milestoneNotFound } from '../common/not-found.js';
import { applyOrder } from '../common/ordering.js';
import { toGoalDto, toMilestoneDto } from '../goals/goal-dto.js';
import type { Milestone, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;

/**
 * Every write runs in one transaction that locks the goal row, then brings the goal's status in
 * line with its milestones (`nextGoalStatus`).
 */
@Injectable()
export class MilestonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** Appended at the end. Reopens a completed goal, since it now has an open milestone. */
  create(userId: string, goalId: string, title: string): Promise<MilestoneChangeResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockGoal(tx, userId, goalId);
      const { _count, _max } = await tx.milestone.aggregate({
        where: { goalId },
        _count: true,
        _max: { sortOrder: true },
      });
      if (_count >= LIMITS.milestonesPerGoal) {
        throw new AppException(
          'LIMIT_REACHED',
          HttpStatus.CONFLICT,
          `A goal can have at most ${LIMITS.milestonesPerGoal} milestones`,
          { limit: LIMITS.milestonesPerGoal },
        );
      }
      const milestone = await tx.milestone.create({
        data: { goalId, title, sortOrder: (_max.sortOrder ?? -1) + 1 },
      });
      return { milestone: toMilestoneDto(milestone), ...(await this.syncGoal(tx, goalId)) };
    });
  }

  async rename(userId: string, id: string, title: string): Promise<MilestoneDto> {
    await this.findOwned(this.prisma, userId, id);
    return toMilestoneDto(await this.prisma.milestone.update({ where: { id }, data: { title } }));
  }

  /** The request must list every milestone of the goal exactly once. */
  reorder(userId: string, goalId: string, ids: string[]): Promise<MilestoneDto[]> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockGoal(tx, userId, goalId);
      const current = await tx.milestone.findMany({
        where: { goalId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      const result = applyOrder(
        current.map((milestone) => milestone.id),
        ids,
        { exact: true },
      );
      if (!result.ok) {
        throw new AppException(
          'BAD_REQUEST',
          HttpStatus.BAD_REQUEST,
          'List every milestone of the goal exactly once',
        );
      }
      const byId = new Map(current.map((milestone) => [milestone.id, milestone]));
      const ordered: MilestoneDto[] = [];
      for (const [sortOrder, id] of result.ids.entries()) {
        let milestone = byId.get(id)!;
        if (milestone.sortOrder !== sortOrder) {
          milestone = await tx.milestone.update({ where: { id }, data: { sortOrder } });
        }
        ordered.push(toMilestoneDto(milestone));
      }
      return ordered;
    });
  }

  /** Ticks or unticks. Ticking the last open milestone completes the goal. */
  toggle(userId: string, id: string): Promise<MilestoneChangeResult> {
    return this.prisma.$transaction(async (tx) => {
      const { goalId } = await this.findOwned(tx, userId, id);
      await this.lockGoal(tx, userId, goalId);
      // Re-read under the lock, so two quick toggles can't both see the old value.
      const current = await tx.milestone.findUniqueOrThrow({ where: { id } });
      const milestone = await tx.milestone.update({
        where: { id },
        data: { completedAt: current.completedAt ? null : this.clock.now() },
      });
      return { milestone: toMilestoneDto(milestone), ...(await this.syncGoal(tx, goalId)) };
    });
  }

  /** Deleting the last open milestone completes the goal. */
  delete(userId: string, id: string): Promise<GoalChangeResult> {
    return this.prisma.$transaction(async (tx) => {
      const { goalId } = await this.findOwned(tx, userId, id);
      await this.lockGoal(tx, userId, goalId);
      await tx.milestone.deleteMany({ where: { id } });
      return this.syncGoal(tx, goalId);
    });
  }

  private async findOwned(db: PrismaService | Tx, userId: string, id: string): Promise<Milestone> {
    const milestone = await db.milestone.findFirst({ where: { id, goal: { userId } } });
    if (!milestone) {
      throw milestoneNotFound();
    }
    return milestone;
  }

  /** 404 unless the goal is the user's; then holds its row lock until the transaction ends. */
  private async lockGoal(tx: Tx, userId: string, goalId: string): Promise<void> {
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM "Goal" WHERE "id" = ${goalId} AND "userId" = ${userId} FOR UPDATE`;
    if (rows.length === 0) {
      throw goalNotFound();
    }
  }

  private async syncGoal(tx: Tx, goalId: string): Promise<GoalChangeResult> {
    const goal = await tx.goal.findUniqueOrThrow({
      where: { id: goalId },
      include: { milestones: { select: { completedAt: true } } },
    });
    const done = goal.milestones.filter((milestone) => milestone.completedAt).length;
    const status = nextGoalStatus(goal.status, done, goal.milestones.length);
    if (status === goal.status) {
      return { goal: toGoalDto(goal, goal.milestones), goalJustCompleted: false };
    }
    const updated = await tx.goal.update({
      where: { id: goalId },
      data: { status, completedAt: status === 'COMPLETED' ? this.clock.now() : null },
    });
    return {
      goal: toGoalDto(updated, goal.milestones),
      goalJustCompleted: status === 'COMPLETED',
    };
  }
}
