import { Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  type LatestReviewDto,
  type ListReviewsQuery,
  listReviewsQuerySchema,
  type LocalDate,
  localDateSchema,
  type ReviewDto,
  type ReviewListDto,
  type UndoResult,
} from '@notch/shared';
import { CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { reviewNotFound, targetChangeNotFound } from '../common/not-found.js';
import { IdParam } from '../common/pipes/id-param.js';
import { ZodQuery, ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ReviewsService } from './reviews.service.js';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** Newest first. */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @ZodQuery(listReviewsQuerySchema) query: ListReviewsQuery,
  ): Promise<ReviewListDto> {
    return this.reviews.list(user.id, query);
  }

  /** Creates last week's review if it's due. `review` is null when there's none yet. */
  @Get('latest')
  latest(@CurrentUser() user: AuthUser): Promise<LatestReviewDto> {
    return this.reviews.latest(user);
  }

  @Get(':weekStart')
  byWeek(
    @CurrentUser() user: AuthUser,
    @Param('weekStart', new ZodValidationPipe(localDateSchema)) weekStart: LocalDate,
  ): Promise<ReviewDto> {
    return this.reviews.byWeek(user.id, weekStart);
  }

  @Post(':id/seen')
  @HttpCode(HttpStatus.OK)
  markSeen(
    @CurrentUser() user: AuthUser,
    @IdParam('id', reviewNotFound) id: string,
  ): Promise<ReviewDto> {
    return this.reviews.markSeen(user.id, id);
  }
}

@Controller('target-changes')
export class TargetChangesController {
  constructor(private readonly reviews: ReviewsService) {}

  /** 409 UNDO_NOT_ALLOWED with `details.reason` when the plan 2.8 conditions aren't met. */
  @Post(':id/undo')
  @HttpCode(HttpStatus.OK)
  undo(
    @CurrentUser() user: AuthUser,
    @IdParam('id', targetChangeNotFound) id: string,
  ): Promise<UndoResult> {
    return this.reviews.undo(user, id);
  }
}
