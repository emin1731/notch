import { Controller, Delete, Get, HttpCode, HttpStatus, Patch, Post, Put } from '@nestjs/common';
import {
  type BatchCoresInput,
  batchCoresSchema,
  type CoreDto,
  type CreateCoreInput,
  createCoreSchema,
  type IdsOrderInput,
  idsOrderSchema,
  type ListCoresQuery,
  listCoresQuerySchema,
  type UpdateCoreInput,
  updateCoreSchema,
} from '@notch/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { coreNotFound } from '../common/not-found.js';
import { IdParam } from '../common/pipes/id-param.js';
import { ZodBody, ZodQuery } from '../common/pipes/zod-validation.pipe.js';
import { CoresService } from './cores.service.js';

@Controller('cores')
export class CoresController {
  constructor(private readonly cores: CoresService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @ZodQuery(listCoresQuerySchema) query: ListCoresQuery,
  ): Promise<CoreDto[]> {
    return this.cores.list(user.id, query.includeArchived);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @ZodBody(createCoreSchema) body: CreateCoreInput,
  ): Promise<CoreDto> {
    return this.cores.create(user.id, body);
  }

  @Post('batch')
  createMany(
    @CurrentUser() user: AuthUser,
    @ZodBody(batchCoresSchema) body: BatchCoresInput,
  ): Promise<CoreDto[]> {
    return this.cores.createMany(user.id, body.cores);
  }

  @Put('order')
  reorder(
    @CurrentUser() user: AuthUser,
    @ZodBody(idsOrderSchema) body: IdsOrderInput,
  ): Promise<CoreDto[]> {
    return this.cores.reorder(user.id, body.ids);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @IdParam('id', coreNotFound) id: string,
    @ZodBody(updateCoreSchema) body: UpdateCoreInput,
  ): Promise<CoreDto> {
    return this.cores.update(user.id, id, body);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  archive(
    @CurrentUser() user: AuthUser,
    @IdParam('id', coreNotFound) id: string,
  ): Promise<CoreDto> {
    return this.cores.archive(user.id, id);
  }

  @Post(':id/unarchive')
  @HttpCode(HttpStatus.OK)
  unarchive(
    @CurrentUser() user: AuthUser,
    @IdParam('id', coreNotFound) id: string,
  ): Promise<CoreDto> {
    return this.cores.unarchive(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @IdParam('id', coreNotFound) id: string,
  ): Promise<void> {
    await this.cores.delete(user.id, id);
  }
}
