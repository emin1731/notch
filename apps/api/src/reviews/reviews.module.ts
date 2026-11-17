import { Module } from '@nestjs/common';
import { ReviewsController, TargetChangesController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({
  controllers: [ReviewsController, TargetChangesController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
