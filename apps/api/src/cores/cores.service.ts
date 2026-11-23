import { HttpStatus, Injectable } from '@nestjs/common';
import type { CoreDto, CreateCoreInput, UpdateCoreInput } from '@notch/shared';
import { Clock } from '../clock/clock.js';
import { AppException } from '../common/errors/app-exception.js';
import { coreNotFound } from '../common/not-found.js';
import { applyOrder } from '../common/ordering.js';
import type { Core, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { coreCountsInclude, toCoreDto } from './core-dto.js';

type Db = PrismaService | Prisma.TransactionClient;

const ORDER = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
] as const satisfies Prisma.CoreOrderByWithRelationInput[];

@Injectable()
export class CoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async list(userId: string, includeArchived: boolean): Promise<CoreDto[]> {
    const cores = await this.prisma.core.findMany({
      where: { userId, ...(!includeArchived && { archivedAt: null }) },
      include: coreCountsInclude,
      orderBy: ORDER,
    });
    return cores.map(toCoreDto);
  }

  async create(userId: string, input: CreateCoreInput): Promise<CoreDto> {
    const [core] = await this.createMany(userId, [input]);
    return core!;
  }

  /** Appended in the given order, all or nothing. Used by onboarding. */
  createMany(userId: string, inputs: CreateCoreInput[]): Promise<CoreDto[]> {
    return this.prisma.$transaction(async (tx) => {
      const start = await this.nextSortOrder(tx, userId);
      const created: CoreDto[] = [];
      for (const [index, input] of inputs.entries()) {
        const core = await tx.core.create({
          data: { ...input, userId, sortOrder: start + index },
          include: coreCountsInclude,
        });
        created.push(toCoreDto(core));
      }
      return created;
    });
  }

  async update(userId: string, id: string, input: UpdateCoreInput): Promise<CoreDto> {
    await this.findOwned(userId, id);
    const core = await this.prisma.core.update({
      where: { id },
      data: input,
      include: coreCountsInclude,
    });
    return toCoreDto(core);
  }

  /** The listed cores first, the others after them in their current order. */
  async reorder(userId: string, ids: string[]): Promise<CoreDto[]> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.core.findMany({
        where: { userId },
        select: { id: true, sortOrder: true },
        orderBy: ORDER,
      });
      const result = applyOrder(
        current.map((core) => core.id),
        ids,
        { exact: false },
      );
      if (!result.ok) {
        throw coreNotFound();
      }
      const sortOrderById = new Map(current.map((core) => [core.id, core.sortOrder]));
      for (const [sortOrder, id] of result.ids.entries()) {
        if (sortOrderById.get(id) !== sortOrder) {
          await tx.core.update({ where: { id }, data: { sortOrder } });
        }
      }
    });
    return this.list(userId, false);
  }

  /** Archives the core and its active habits with the same timestamp (plan 2.10). */
  async archive(userId: string, id: string): Promise<CoreDto> {
    const core = await this.prisma.$transaction(async (tx) => {
      const existing = await this.findOwned(userId, id, tx);
      if (existing.archivedAt) {
        return existing;
      }
      const archivedAt = this.clock.now();
      await tx.habit.updateMany({ where: { coreId: id, archivedAt: null }, data: { archivedAt } });
      return tx.core.update({ where: { id }, data: { archivedAt } });
    });
    return this.dto(core.id);
  }

  /** Restores the core only; its habits are unarchived one by one. */
  async unarchive(userId: string, id: string): Promise<CoreDto> {
    await this.findOwned(userId, id);
    await this.prisma.core.update({ where: { id }, data: { archivedAt: null } });
    return this.dto(id);
  }

  /** Only an empty core can be deleted: no habits, archived ones included. */
  async delete(userId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.findOwned(userId, id, tx);
      const habits = await tx.habit.count({ where: { coreId: id } });
      if (habits > 0) {
        throw new AppException(
          'CORE_NOT_EMPTY',
          HttpStatus.CONFLICT,
          'Move or delete its habits first',
        );
      }
      await tx.core.delete({ where: { id } });
    });
  }

  /** The user's core, or 404. Other services use it before attaching habits. */
  async findOwned(userId: string, id: string, db: Db = this.prisma): Promise<Core> {
    const core = await db.core.findFirst({ where: { id, userId } });
    if (!core) {
      throw coreNotFound();
    }
    return core;
  }

  private async dto(id: string): Promise<CoreDto> {
    return toCoreDto(
      await this.prisma.core.findUniqueOrThrow({ where: { id }, include: coreCountsInclude }),
    );
  }

  private async nextSortOrder(db: Db, userId: string): Promise<number> {
    const { _max } = await db.core.aggregate({ where: { userId }, _max: { sortOrder: true } });
    return (_max.sortOrder ?? -1) + 1;
  }
}
