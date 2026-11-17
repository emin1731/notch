import { Controller, Get } from '@nestjs/common';
import {
  type HabitStatsDto,
  type StatsOverviewDto,
  type StatsQuery,
  statsQuerySchema,
} from '@notch/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { habitNotFound } from '../common/not-found.js';
import { IdParam } from '../common/pipes/id-param.js';
import { ZodQuery } from '../common/pipes/zod-validation.pipe.js';
import { StatsService } from './stats.service.js';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** `range`: 7d, 30d (default), 90d or 365d, ending today. */
  @Get('overview')
  overview(
    @CurrentUser() user: AuthUser,
    @ZodQuery(statsQuerySchema) query: StatsQuery,
  ): Promise<StatsOverviewDto> {
    return this.stats.overview(user, query.range);
  }

  @Get('habits/:id')
  habit(
    @CurrentUser() user: AuthUser,
    @IdParam('id', habitNotFound) id: string,
    @ZodQuery(statsQuerySchema) query: StatsQuery,
  ): Promise<HabitStatsDto> {
    return this.stats.habit(user, id, query.range);
  }
}
