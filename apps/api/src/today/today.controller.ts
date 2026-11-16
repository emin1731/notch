import { Controller, Get } from '@nestjs/common';
import { type TodayQuery, todayQuerySchema, type TodayResponse } from '@notch/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { ZodQuery } from '../common/pipes/zod-validation.pipe.js';
import { TodayService } from './today.service.js';

@Controller('today')
export class TodayController {
  constructor(private readonly today: TodayService) {}

  /** `date` defaults to the local today; it can be up to 6 days back. */
  @Get()
  get(
    @CurrentUser() user: AuthUser,
    @ZodQuery(todayQuerySchema) query: TodayQuery,
  ): Promise<TodayResponse> {
    return this.today.forDate(user, query.date);
  }
}
