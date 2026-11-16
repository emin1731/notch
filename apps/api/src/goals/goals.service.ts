import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CreateGoalInput,
  fromDateString,
  type GoalDetailDto,
  type GoalDto,
  type ListGoalsQuery,
  type UpdateGoalInput,
} from '@notch/shared';
import { AppException } from '../common/errors/app-exception.js';
import { goalNotFound } from '../common/not-found.js';
import { CoresService } from '../cores/cores.service.js';
import type { Goal, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toGoalDetailDto, toGoalDto } from './goal-dto.js';

type Db = PrismaService | Prisma.TransactionClient;

const MILESTONE_ORDER = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
] as const satisfies Prisma.MilestoneOrderByWithRelationInput[];

const coreArchived = () =>
  new AppException(
    'CORE_ARCHIVED',
    HttpStatus.CONFLICT,
    'The core is archived. Unarchive it first.',
  );

const hasMilestones = () =>
  new AppException(
    'GOAL_HAS_MILESTONES',
    HttpStatus.CONFLICT,
    'A goal with milestones completes when its last milestone is ticked',
  );

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cores: CoresService,
  ) {}

  async list(userId: string, query: ListGoalsQuery): Promise<GoalDto[]> {
    const goals = await this.prisma.goal.findMany({
      where: {
        userId,
        ...(query.coreId && { coreId: query.coreId }),
        ...(query.status && { status: query.status }),
        ...(!query.includeArchived && { archivedAt: null }),
      },
      include: { milestones: { select: { completedAt: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return goals.map((goal) => toGoalDto(goal, goal.milestones));
  }

  async detail(userId: string, id: string): Promise<GoalDetailDto> {
    await this.findOwned(userId, id);
    return this.detailOf(id);
  }

  async create(userId: string, input: CreateGoalInput): Promise<GoalDetailDto> {
    const goal = await this.prisma.$transaction(async (tx) => {
      await this.assertCoreUsable(userId, input.coreId, tx);
      const { _max } = await tx.goal.aggregate({ where: { userId }, _max: { sortOrder: true } });
      return tx.goal.create({
        data: {
          userId,
          coreId: input.coreId,
          title: input.title,
          description: input.description || null,
          deadline: input.deadline ? fromDateString(input.deadline) : null,
          sortOrder: (_max.sortOrder ?? -1) + 1,
          milestones: {
            create: (input.milestones ?? []).map((title, sortOrder) => ({ title, sortOrder })),
          },
        },
      });
    });
    return this.detailOf(goal.id);
  }

  // S3: moving a goal with linked habits to another core moves the habits too (plan 6.3).
  async update(userId: string, id: string, input: UpdateGoalInput): Promise<GoalDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const goal = await this.findOwned(userId, id, tx);
      if (input.coreId !== undefined && input.coreId !== goal.coreId) {
        await this.assertCoreUsable(userId, input.coreId, tx);
      }
      await tx.goal.update({
        where: { id },
        data: {
          ...(input.coreId !== undefined && { coreId: input.coreId }),
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && { description: input.description || null }),
          ...(input.deadline !== undefined && {
            deadline: input.deadline === null ? null : fromDateString(input.deadline),
          }),
        },
      });
    });
    return this.detailOf(id);
  }

  /** Manual completion, only for goals without milestones (plan 2.9). */
  complete(userId: string, id: string): Promise<GoalDetailDto> {
    return this.setManualStatus(userId, id, 'COMPLETED');
  }

  reopen(userId: string, id: string): Promise<GoalDetailDto> {
    return this.setManualStatus(userId, id, 'ACTIVE');
  }

  /** Keeps the status: an archived completed goal is still completed. */
  async archive(userId: string, id: string): Promise<GoalDetailDto> {
    const goal = await this.findOwned(userId, id);
    if (!goal.archivedAt) {
      await this.prisma.goal.update({ where: { id }, data: { archivedAt: new Date() } });
    }
    return this.detailOf(id);
  }

  async unarchive(userId: string, id: string): Promise<GoalDetailDto> {
    const goal = await this.findOwned(userId, id);
    await this.assertCoreUsable(userId, goal.coreId);
    await this.prisma.goal.update({ where: { id }, data: { archivedAt: null } });
    return this.detailOf(id);
  }

  /** Milestones cascade. S3: linked habits are unlinked (goalId → null), not deleted. */
  async delete(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.goal.deleteMany({ where: { id, userId } });
    if (count === 0) {
      throw goalNotFound();
    }
  }

  /** The user's goal, or 404. */
  async findOwned(userId: string, id: string, db: Db = this.prisma): Promise<Goal> {
    const goal = await db.goal.findFirst({ where: { id, userId } });
    if (!goal) {
      throw goalNotFound();
    }
    return goal;
  }

  async detailOf(id: string, db: Db = this.prisma): Promise<GoalDetailDto> {
    const goal = await db.goal.findUniqueOrThrow({
      where: { id },
      include: { milestones: { orderBy: MILESTONE_ORDER } },
    });
    return toGoalDetailDto(goal, goal.milestones);
  }

  private async setManualStatus(
    userId: string,
    id: string,
    status: 'ACTIVE' | 'COMPLETED',
  ): Promise<GoalDetailDto> {
    await this.prisma.$transaction(async (tx) => {
      const goal = await this.findOwned(userId, id, tx);
      if ((await tx.milestone.count({ where: { goalId: id } })) > 0) {
        throw hasMilestones();
      }
      if (goal.status !== status) {
        await tx.goal.update({
          where: { id },
          data: { status, completedAt: status === 'COMPLETED' ? new Date() : null },
        });
      }
    });
    return this.detailOf(id);
  }

  private async assertCoreUsable(userId: string, coreId: string, db: Db = this.prisma) {
    const core = await this.cores.findOwned(userId, coreId, db);
    if (core.archivedAt) {
      throw coreArchived();
    }
  }
}
