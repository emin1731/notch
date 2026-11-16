import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put } from '@nestjs/common';
import {
  type CreateHabitInput,
  createHabitSchema,
  type HabitDetailDto,
  type HabitDto,
  type IdsOrderInput,
  idsOrderSchema,
  type ListHabitsQuery,
  listHabitsQuerySchema,
  type TargetChangeDto,
  type UpdateHabitInput,
  updateHabitSchema,
} from '@notch/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { habitNotFound } from '../common/not-found.js';
import { IdParam } from '../common/pipes/id-param.js';
import { ZodBody, ZodQuery } from '../common/pipes/zod-validation.pipe.js';
import { HabitsService } from './habits.service.js';

@Controller('habits')
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @ZodQuery(listHabitsQuerySchema) query: ListHabitsQuery,
  ): Promise<HabitDto[]> {
    return this.habits.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @ZodBody(createHabitSchema) body: CreateHabitInput,
  ): Promise<HabitDetailDto> {
    return this.habits.create(user, body);
  }

  @Put('order')
  reorder(
    @CurrentUser() user: AuthUser,
    @ZodBody(idsOrderSchema) body: IdsOrderInput,
  ): Promise<HabitDto[]> {
    return this.habits.reorder(user.id, body.ids);
  }

  @Get(':id')
  detail(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
  ): Promise<HabitDetailDto> {
    return this.habits.detail(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
    @ZodBody(updateHabitSchema) body: UpdateHabitInput,
  ): Promise<HabitDetailDto> {
    return this.habits.update(user, id, body);
  }

  @Get(':id/target-history')
  targetHistory(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
  ): Promise<TargetChangeDto[]> {
    return this.habits.targetHistory(user.id, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
  ): Promise<HabitDetailDto> {
    return this.habits.archive(user.id, id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
  ): Promise<HabitDetailDto> {
    return this.habits.unarchive(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
  ): Promise<void> {
    await this.habits.delete(user.id, id);
  }
}
