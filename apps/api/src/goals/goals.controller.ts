import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put } from '@nestjs/common';
import {
  type CreateGoalInput,
  type CreateMilestoneInput,
  createGoalSchema,
  createMilestoneSchema,
  type GoalDetailDto,
  type GoalDto,
  type IdsOrderInput,
  idsOrderSchema,
  type ListGoalsQuery,
  listGoalsQuerySchema,
  type MilestoneChangeResult,
  type MilestoneDto,
  type UpdateGoalInput,
  updateGoalSchema,
} from '@notch/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { goalNotFound } from '../common/not-found.js';
import { IdParam } from '../common/pipes/id-param.js';
import { ZodBody, ZodQuery } from '../common/pipes/zod-validation.pipe.js';
import { MilestonesService } from '../milestones/milestones.service.js';
import { GoalsService } from './goals.service.js';

@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goals: GoalsService,
    private readonly milestones: MilestonesService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @ZodQuery(listGoalsQuerySchema) query: ListGoalsQuery,
  ): Promise<GoalDto[]> {
    return this.goals.list(user.id, query);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthUser,
    @IdParam('id', goalNotFound) id: string,
  ): Promise<GoalDetailDto> {
    return this.goals.detail(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @ZodBody(createGoalSchema) body: CreateGoalInput,
  ): Promise<GoalDetailDto> {
    return this.goals.create(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @IdParam('id', goalNotFound) id: string,
    @ZodBody(updateGoalSchema) body: UpdateGoalInput,
  ): Promise<GoalDetailDto> {
    return this.goals.update(user.id, id, body);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  complete(
    @CurrentUser() user: AuthUser,
    @IdParam('id', goalNotFound) id: string,
  ): Promise<GoalDetailDto> {
    return this.goals.complete(user.id, id);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(
    @CurrentUser() user: AuthUser,
    @IdParam('id', goalNotFound) id: string,
  ): Promise<GoalDetailDto> {
    return this.goals.reopen(user.id, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() user: AuthUser,
    @IdParam('id', goalNotFound) id: string,
  ): Promise<GoalDetailDto> {
    return this.goals.archive(user.id, id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(
    @CurrentUser() user: AuthUser,
    @IdParam('id', goalNotFound) id: string,
  ): Promise<GoalDetailDto> {
    return this.goals.unarchive(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @IdParam('id', goalNotFound) id: string,
  ): Promise<void> {
    await this.goals.delete(user.id, id);
  }

  @Post(':goalId/milestones')
  createMilestone(
    @CurrentUser() user: AuthUser,
    @IdParam('goalId', goalNotFound) goalId: string,
    @ZodBody(createMilestoneSchema) body: CreateMilestoneInput,
  ): Promise<MilestoneChangeResult> {
    return this.milestones.create(user.id, goalId, body.title);
  }

  @Put(':goalId/milestones/order')
  reorderMilestones(
    @CurrentUser() user: AuthUser,
    @IdParam('goalId', goalNotFound) goalId: string,
    @ZodBody(idsOrderSchema) body: IdsOrderInput,
  ): Promise<MilestoneDto[]> {
    return this.milestones.reorder(user.id, goalId, body.ids);
  }
}
