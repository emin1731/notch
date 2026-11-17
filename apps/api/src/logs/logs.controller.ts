import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import {
  type IncrementLogInput,
  incrementLogSchema,
  type LocalDate,
  localDateSchema,
  type LogDto,
  type LogRangeQuery,
  logRangeQuerySchema,
  type LogWriteResult,
  type SetLogInput,
  setLogSchema,
} from '@notch/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { habitNotFound } from '../common/not-found.js';
import { IdParam } from '../common/pipes/id-param.js';
import { ZodBody, ZodQuery, ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { LogsService } from './logs.service.js';

const DateParam = (): ParameterDecorator => Param('date', new ZodValidationPipe(localDateSchema));

@Controller('habits/:id/logs')
export class LogsController {
  constructor(private readonly logs: LogsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
    @ZodQuery(logRangeQuerySchema) query: LogRangeQuery,
  ): Promise<LogDto[]> {
    return this.logs.list(user, id, query);
  }

  @Put(':date')
  set(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
    @DateParam() date: LocalDate,
    @ZodBody(setLogSchema) body: SetLogInput,
  ): Promise<LogWriteResult> {
    return this.logs.set(user, id, date, body.value);
  }

  @Post(':date/increment')
  @HttpCode(HttpStatus.OK)
  increment(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
    @DateParam() date: LocalDate,
    @ZodBody(incrementLogSchema) body: IncrementLogInput,
  ): Promise<LogWriteResult> {
    return this.logs.increment(user, id, date, body.delta);
  }

  @Delete(':date')
  remove(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
    @DateParam() date: LocalDate,
  ): Promise<LogWriteResult> {
    return this.logs.remove(user, id, date);
  }
}
