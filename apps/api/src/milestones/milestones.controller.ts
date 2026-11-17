import { Controller, Delete, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import {
  type GoalChangeResult,
  type MilestoneChangeResult,
  type MilestoneDto,
  type UpdateMilestoneInput,
  updateMilestoneSchema,
} from '@notch/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { milestoneNotFound } from '../common/not-found.js';
import { IdParam } from '../common/pipes/id-param.js';
import { ZodBody } from '../common/pipes/zod-validation.pipe.js';
import { MilestonesService } from './milestones.service.js';

/** Routes on a single milestone. Creating and reordering live under /goals/:goalId/milestones. */
@Controller('milestones')
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @Patch(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @IdParam('id', milestoneNotFound) id: string,
    @ZodBody(updateMilestoneSchema) body: UpdateMilestoneInput,
  ): Promise<MilestoneDto> {
    return this.milestones.rename(user.id, id, body.title);
  }

  @Post(':id/toggle')
  @HttpCode(HttpStatus.OK)
  toggle(
    @CurrentUser() user: AuthUser,
    @IdParam('id', milestoneNotFound) id: string,
  ): Promise<MilestoneChangeResult> {
    return this.milestones.toggle(user.id, id);
  }

  /** 200 with the goal, which may have just completed. */
  @Delete(':id')
  delete(
    @CurrentUser() user: AuthUser,
    @IdParam('id', milestoneNotFound) id: string,
  ): Promise<GoalChangeResult> {
    return this.milestones.delete(user.id, id);
  }
}
